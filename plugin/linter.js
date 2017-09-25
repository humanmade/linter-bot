const fs = require( 'fs' );
const https = require( 'https' );
const parseDiff = require( 'parse-diff' );
const path = require( 'path' );
const pify = require( 'pify' );
const rimraf = require( 'rimraf' );
const tar = require( 'tar' );

const realpath = pify( fs.realpath );

const linters = [
	require( '../linters/phpcs' )
];

const DOWNLOAD_DIR = '/tmp/downloads';
const REPO_DIR = '/tmp/repos';

[ DOWNLOAD_DIR, REPO_DIR ].forEach( dir => {
	try {
		fs.mkdir( dir, () => {} );
	}
	catch ( e ) {
		console.log( e );
	}
} );

const downloadFile = ( url, filename ) => {
	const downloadPath = path.join( DOWNLOAD_DIR, filename );
	const handle = fs.createWriteStream( downloadPath );

	return new Promise( ( resolve, reject ) => {
		const httpHandle = https.get( url, resp => {
			resp.pipe( handle );
			handle.on( 'finish', () => {
				handle.close( () => resolve( downloadPath ) );
			} );
		} );
		httpHandle.on( 'error', err => {
			fs.unlink( downloadPath );
			return reject( err );
		} );
		handle.on( 'error', err => {
			fs.unlink( downloadPath );
			return reject( err );
		} );
	} );
};

const runForRepo = async ( pushConfig, github ) => {
	const { commit, owner, repo } = pushConfig;

	// Don't follow redirects for this request.
	github.config.followRedirects = false;
	const archiveURLResult = await github.repos.getArchiveLink( {
		owner,
		repo,
		archive_format: 'tarball',
		ref:            pushConfig.commit,
	});
	const archiveURL = archiveURLResult.meta.location;
	// Reset redirect config.
	delete github.config.followRedirects;

	const filename = `${owner}-${repo}-${commit}.tar.gz`;
	const tarball = await downloadFile( archiveURL, filename );

	const extractDir = path.join( await realpath( REPO_DIR ), `${owner}-${repo}-${commit}` );
	try {
		await pify( fs.mkdir )( extractDir );
	} catch ( e ) {
		// Ignore if it already exists.
	}

	const extracted = await tar.extract( {
		cwd:   extractDir,
		file:  tarball,
		strip: 1,
	} );

	// Delete the now-unneeded tarball.
	fs.unlink( tarball, () => {} );

	// Now that we have the code, start linting!
	const results = await Promise.all( linters.map( linter => linter( extractDir, pushConfig ) ) );

	// Remove the temporary directory.
	await pify( rimraf )( extractDir );

	// Calculate totals across all tools.
	const totals = results.reduce( ( totals, result ) => {
		if ( result.totals.errors ) {
			totals.errors += result.totals.errors;
		}
		if ( result.totals.warnings ) {
			totals.warnings += result.totals.warnings;
		}
		return totals;
	}, { errors: 0, warnings: 0 } );

	return { totals, passed: totals.errors === 0, results };
};

const formatSummary = status => {
	const { passed, totals } = status;
	if ( passed ) {
		return 'All linters passed';
	}

	const summaryBits = [];
	if ( totals.errors ) {
		summaryBits.push( totals.errors === 1 ? '1 error' : `${ totals.errors } errors` );
	}
	if ( totals.warnings ) {
		summaryBits.push( totals.warnings === 1 ? '1 warning' : `${ totals.warnings } warnings` );
	}
	return summaryBits.join( ', ' );
};

const getDiffMapping = async ( pushConfig, number, github ) => {
	const diff = await github.pullRequests.get({
		owner: pushConfig.owner,
		repo: pushConfig.repo,
		number,

		headers: {
			Accept: 'application/vnd.github.v3.diff',
		}
	});

	// Form mapping.
	const mapping = {};
	const parsedFiles = parseDiff( diff.data );
	parsedFiles.forEach( file => {
		let position = 0;
		mapping[ file.to ] = {};
		file.chunks.forEach( (chunk, index) => {
			if (index !== 0) {
				position++;
			}
			chunk.changes.forEach( change => {
				position++;
				mapping[ file.to ][ change.ln || change.ln2 ] = position;
			} );
		} );
	} );
	return mapping;
};

module.exports = robot => {
	robot.on( 'push', async context => {
		// Start a "build".
		const { github, payload } = context;
		const commit = payload.head_commit.id;
		const owner = payload.repository.owner.name;
		const repo = payload.repository.name;

		// Set up the build first.
		const setStatus = ( state, description ) => {
			github.repos.createStatus( {
				owner,
				repo,
				sha:     commit,
				context: 'hmlinter',
				state,
				description
			} );
		};

		setStatus( 'pending', 'Running lint tools…' );

		const pushConfig = { commit, owner, repo };
		let lintState;
		try {
			lintState = await runForRepo( pushConfig, github );
		} catch ( e ) {
			setStatus( 'error', `Could not run: ${ e }` );
			throw e;
		}

		setStatus(
			lintState.passed ? 'success' : 'failure',
			formatSummary( lintState )
		);
	} );
	robot.on( 'pull_request.opened', async context => {
		const { github, payload } = context;
		const commit = payload.pull_request.head.sha;
		const owner = payload.repository.owner.login;
		const repo = payload.repository.name;

		// Run the linter, and also fetch the PR diff.
		const pushConfig = { commit, owner, repo };

		let diffMapping, lintState;
		try {
			[ lintState, diffMapping ] = await Promise.all([
				runForRepo( pushConfig, github ),
				getDiffMapping( pushConfig, payload.number, github ),
			]);
		} catch ( e ) {
			throw e;
		}

		if ( lintState.passed ) {
			github.pullRequests.createReview( {
				owner,
				repo,
				number:    payload.number,
				commit_id: commit,
				event:     'APPROVE',
			} );
			return;
		}

		// Combine all messages.
		const files = {};
		lintState.results.forEach( result => {
			Object.keys( result.files ).forEach( file => {
				if ( ! files[ file ] ) {
					files[ file ] = {};
				}
				const comments = result.files[ file ];
				comments.forEach( comment => {
					if ( ! files[ file ][ comment.line ] ) {
						files[ file ][ comment.line ] = []
					}
					files[ file ][ comment.line ].push(
						comment.message
					);
				} );
			} );
		} );

		// Convert to GitHub comments.
		const comments = [];
		let skipped = 0;
		Object.keys( files ).forEach( file => {
			Object.keys( files[ file ] ).forEach( line => {
				// Skip files which didn't change.
				if ( ! diffMapping[ file ] ) {
					skipped += files[ file ][ line ].length;
					return;
				}

				// Translate line to diff position.
				const position = diffMapping[ file ][ line ];
				if ( ! position ) {
					skipped += files[ file ][ line ].length;
					return;
				}

				const body = files[ file ][ line ].join( '\n\n----\n\n' );
				comments.push( {
					file,
					position,
					body,
				} );
			} );
		} );

		let body = `Linting failed (${ formatSummary( lintState ) }).`;
		let event = 'REQUEST_CHANGES';
		if ( skipped ) {
			const numText = skipped === 1 ? '1 notice' : `${skipped} notices`;

			if ( comments.length === 0 ) {
				// All errors already existing.
				event = 'COMMENT';
				body += `\n\n${numText} occurred in your codebase, but none on files/lines included in this PR.`;
			} else {
				body += `\n\n(${numText} occurred in your codebase, but were on files/lines not included in this PR.)`;
			}
		}
		console.log( {
			owner,
			repo,
			number:    payload.number,
			commit_id: commit,
			body:      body,
			event,
			comments,
		} );

		// path, position, body

		github.pullRequests.createReview( {
			owner,
			repo,
			number:    payload.number,
			commit_id: commit,
			body:      body,
			event,
			comments:  comments,
		} );
	} );
	// robot.on( 'pull_request.synchronize', )
};

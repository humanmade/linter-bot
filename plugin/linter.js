const parseDiff = require( 'parse-diff' );
const githubApi = require( 'github' );

const runForRepo = require( './run.js' );

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
		const setStatus = ( state, description, logUrl ) => {
			github.repos.createStatus( {
				owner,
				repo,
				sha:     commit,
				context: 'hmlinter',
				state,
				description: description.substr( 0,139 ),
				target_url: logUrl,
			} );
		};

		setStatus( 'pending', 'Running lint tools…' );

		const pushConfig = { commit, owner, repo };
		let lintState;
		try {
			lintState = await runForRepo( pushConfig, github );
		} catch ( e ) {
			console.log(e)
			setStatus( 'error', `Could not run: ${ e }` );
			throw e;
		}

		// Generate a string for a gist with all messages.
		let logUrl = '';
		if ( ! lintState.passed ) {

			const anonymousGithub = new githubApi();
			const response = await anonymousGithub.gists.create( {
				files: {
					'linter-output.txt': { content: JSON.stringify( lintState, null, 2 ) },
				},
				public: false,
				description: `${owner}/${repo} ${commit}`,
			} );
			logUrl = response.data.html_url;
		}

		setStatus(
			lintState.passed ? 'success' : 'failure',
			formatSummary( lintState ),
			logUrl
		);

		console.log( JSON.stringify( lintState, null, 2 ) );
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
					path: file,
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

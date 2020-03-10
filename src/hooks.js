const _chunk = require( 'lodash.chunk' );
const serializeError = require( 'serialize-error' );

const getConfig = require( './config' );
const runForRepo = require( './run.js' );
const { getDiffMapping } = require( './diff' );
const {
	formatAnnotations,
	formatDetails,
	formatMetadata,
	formatReview,
	formatReviewChange,
	formatSummary,
	formatWelcome
} = require( './format' );
const { compareRuns, getPreviousRun } = require( './review' );
const { createGist } = require( './util' );

const onAdd = async context => {
	const { github, payload } = context;
	const owner = payload.installation.account.login;
	const repos = payload.repositories_added;

	repos.forEach( async repo => {
		const { data } = await github.repos.get( { owner, repo: repo.name } );
		const branch = await github.repos.getBranch( { owner, repo: repo.name, branch: data.default_branch } );

		const pushConfig = {
			owner,
			repo: repo.name,
			commit: branch.data.commit.sha,
		};
		let lintState;
		try {
			lintState = await runForRepo( pushConfig, getConfig( context ), github );
		} catch ( e ) {
			console.log( e );
			throw e;
		}

		const gistUrl = await createGist(
			`${ owner }/${ repo.name } ${ branch.data.commit.sha }`,
			'linter-output.txt',
			formatDetails( lintState )
		);

		const body = formatWelcome( lintState, gistUrl );
		const summary = formatSummary( lintState );
		github.issues.create( {
			owner,
			repo: repo.name,
			title: `Hello from ${ process.env.BOT_NAME || 'hmlinter' }! (${ summary })`,
			body,
		} );
	} );
};

const onPush = async context => {
	// Start a "build".
	const { github, payload } = context;
	if ( payload.deleted ) {
		// If the branch was deleted, skip.
		return;
	}

	const commit = payload.head_commit.id;
	const owner = payload.repository.owner.name;
	const repo = payload.repository.name;

	// Set up the build first.
	const setStatus = ( state, description, logUrl ) => {
		github.repos.createStatus( {
			owner,
			repo,
			sha:     commit,
			context: process.env.BOT_NAME || 'hmlinter',
			state,
			description: description.substr( 0,139 ),
			target_url: logUrl,
		} );
	};

	setStatus( 'pending', 'Running lint tools…' );

	const pushConfig = { commit, owner, repo };
	let lintState;
	let logUrl = '';
	try {
		lintState = await runForRepo( pushConfig, getConfig( context ), github );
	} catch ( e ) {
		console.log(e)
		logUrl = await createGist(
			`${owner}/${repo} ${commit}`,
			'linter-output.txt',
			JSON.stringify( serializeError( e ), null, 2 )
		);
		setStatus( 'error', `Could not run: ${ e }`, logUrl );
		throw e;
	}

	// Generate a string for a gist with all messages.
	if ( ! lintState.passed ) {
		logUrl = await createGist(
			`${owner}/${repo} ${commit}`,
			'linter-output.txt',
			formatDetails( lintState )
		);
	}

	setStatus(
		lintState.passed ? 'success' : 'failure',
		formatSummary( lintState ),
		logUrl
	);

	console.log( JSON.stringify( lintState, null, 2 ) );
};

const onCheck = async context => {
	// Start a "build".
	const { github, payload } = context;

	const { head_branch, head_sha } = payload.check_suite || payload.check_run.check_suite;

	const owner = payload.repository.owner.login;
	const repo = payload.repository.name;

	// Set up the build first.
	const checkCreation = github.request( {
		method: 'POST',
		url: `/repos/${owner}/${repo}/check-runs`,
		headers: {
			accept: 'application/vnd.github.antiope-preview+json',
		},
		input: {
			name: process.env.BOT_NAME || 'hmlinter',
			head_branch,
			head_sha,
			started_at: ( new Date() ).toISOString(),
			output: {
				title: 'Checking…',
				summary: formatMetadata( context ),
			},
		},
	} );

	const updateRun = async output => {
		const runResult = await checkCreation;

		github.request( {
			method: 'PATCH',
			url: `/repos/${ owner }/${ repo }/check-runs/${ runResult.data.id }`,
			headers: {
				accept: 'application/vnd.github.antiope-preview+json',
			},
			input: {
				output: {
					...output,
					summary: output.summary + formatMetadata( context ),
				},
			}
		} );
	};

	const completeRun = async ( conclusion, output ) => {
		const runResult = await checkCreation;

		github.request( {
			method: 'PATCH',
			url: `/repos/${ owner }/${ repo }/check-runs/${ runResult.data.id }`,
			headers: {
				accept: 'application/vnd.github.antiope-preview+json',
			},
			input: {
				completed_at: ( new Date() ).toISOString(),
				status: 'completed',
				conclusion,
				output: {
					...output,
					summary: output.summary + formatMetadata( context ),
				},
			}
		} );
	};

	const pushConfig = { commit: head_sha, owner, repo };
	let lintState;
	try {
		lintState = await runForRepo( pushConfig, getConfig( context ), github );
	} catch ( e ) {
		console.log(e)
		completeRun(
			process.env.FORCE_NEUTRAL_STATUS ? 'neutral' : 'failure',
			{
				title: `Failed to run ${ process.env.BOT_NAME || 'hmlinter' }`,
				summary: `Could not run: ${ e }`,
				output: JSON.stringify( serializeError( e ), null, 2 )
			}
		);
		throw e;
	}

	if ( process.env.FORCE_NEUTRAL_STATUS ) {
		console.log( 'Setting status to neutral' );
		let gistUrl;
		try {
			gistUrl = await createGist(
				`${ owner }/${ repo.name }@${ head_sha }`,
				'output.json',
				formatDetails( lintState )
			);
		} catch ( e ) {
			console.log( 'Triggered error' );
			console.log( e );
			completeRun(
				'neutral',
				{
					title: `Failed to run ${ process.env.BOT_NAME || 'hmlinter' }`,
					summary: `Could not run: ${ e }`,
					output: JSON.stringify( serializeError( e ), null, 2 )
				}
			);
			throw e;
		}

		const summary = formatSummary( lintState );
		const fullSummary = summary + `\n\n[View output](${ gistUrl })`;
		completeRun(
			'neutral',
			{
				title: lintState.passed ? 'All checks passed' : `Ignored ${ summary }`,
				summary: fullSummary,
			}
		);
	} else if ( lintState.passed ) {
		completeRun(
			'success',
			{
				title: 'All checks passed',
				summary: formatSummary( lintState ),
			}
		);
	} else {
		const annotations = formatAnnotations( lintState, `https://github.com/${owner}/${repo}/blob/${head_sha}` );

		// Push annotations 50 at a time (and send the leftovers with the completion).
		const annotationGroups = _chunk( annotations, 50 );
		const lastGroup = annotationGroups.pop();
		await Promise.all( annotationGroups.map( chunk => {
			return updateRun( {
				title: 'Checking…',
				summary: '',
				annotations: chunk,
			} );
		} ) );

		completeRun(
			'failure',
			{
				title: `${ process.env.BOT_NAME || 'hmlinter' } checks failed`,
				summary: formatSummary( lintState ),
				annotations: lastGroup,
			}
		);
	}

	console.log( JSON.stringify( lintState, null, 2 ) );
};

const onOpenPull = async context => {
	const { github, payload } = context;
	const commit = payload.pull_request.head.sha;
	const owner = payload.repository.owner.login;
	const repo = payload.repository.name;

	// Run the linter, and also fetch the PR diff.
	const pushConfig = { commit, owner, repo };

	let diffMapping, lintState;
	try {
		[ lintState, diffMapping ] = await Promise.all([
			runForRepo( pushConfig, getConfig( context ), github ),
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

	const { body, event } = formatReview( lintState, diffMapping );
	console.log( {
		owner,
		repo,
		number:    payload.number,
		commit_id: commit,
		body:      body,
		event,
	} );

	// path, position, body

	github.pullRequests.createReview( {
		owner,
		repo,
		number:    payload.number,
		commit_id: commit,
		body:      body,
		event,
	} );
};

const onUpdatePull = async context => {
	const { github, payload } = context;
	const commit = payload.pull_request.head.sha;
	const owner = payload.repository.owner.login;
	const repo = payload.repository.name;

	// Run the linter, and also fetch the PR diff.
	const pushConfig = { commit, owner, repo };

	let diffMapping, lintState, previousState;
	try {
		[ lintState, diffMapping, previousState ] = await Promise.all([
			runForRepo( pushConfig, getConfig( context ), github ),
			getDiffMapping( pushConfig, payload.number, github ),
			getPreviousRun( github, owner, repo, payload.number ),
		]);
	} catch ( e ) {
		throw e;
	}

	// If there's no previous state, ignore this update.
	if ( ! previousState ) {
		console.log( 'No previous state' );
		return;
	}

	const comparison = compareRuns( previousState, lintState );
	const review = formatReviewChange( lintState, diffMapping, comparison );
	console.log( { comparison, review } );

	if ( ! review ) {
		console.log( 'No review' );
		return;
	}

	github.pullRequests.createReview( {
		owner,
		repo,
		number:    payload.number,
		commit_id: commit,

		...review,
	} );
}

module.exports = {
	onAdd,
	onCheck,
	onPush,
	onOpenPull,
	onUpdatePull,
};

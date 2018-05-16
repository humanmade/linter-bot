const serializeError = require( 'serialize-error' );

const runForRepo = require( './run.js' );
const { getDiffMapping } = require( './diff' );
const {
	formatDetails,
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
			lintState = await runForRepo( pushConfig, github );
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
			title: `Hello from hm-linter! (${ summary })`,
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
			context: 'hmlinter',
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
		lintState = await runForRepo( pushConfig, github );
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

	const { head_branch, head_sha } = payload.check_suite;

	const owner = payload.repository.owner.name;
	const repo = payload.repository.name;

	// Set up the build first.
	const checkCreation = github.checks.create( {
		owner,
		repo,
		name: 'hmlinter',
		head_branch,
		head_sha,
		started_at: ( new Date() ).toISOString(),
	} );

	const completeRun = async ( conclusion, output ) => {
		const runId = await checkCreation;
		github.checks.update( {
			owner,
			repo,
			name: 'hmlinter',
			check_run_id: runId,

			completed_at: ( new Date() ).toISOString(),
			status: 'completed',
			conclusion,
			output
		} );
	};

	const pushConfig = { commit: head_sha, owner, repo };
	let lintState;
	let logUrl = '';
	try {
		lintState = await runForRepo( pushConfig, github );
	} catch ( e ) {
		console.log(e)
		completeRun(
			'failure',
			{
				title: 'Failed to run hmlinter',
				summary: `Could not run: ${ e }`,
				output: JSON.stringify( serializeError( e ), null, 2 )
			}
		);
		throw e;
	}

	// Generate a string for a gist with all messages.
	if ( ! lintState.passed ) {
		logUrl = await createGist(
			`${owner}/${repo} ${head_sha}`,
			'linter-output.txt',
			formatDetails( lintState )
		);
	}

	completeRun(
		lintState.passed ? 'success' : 'failure',
		{
			title: lintState.passed ? 'All checks passed' : 'hmlinter checks failed',
			summary: formatSummary( lintState ),
		}
	);

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

	const { body, comments, event } = formatReview( lintState, diffMapping );
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
			runForRepo( pushConfig, github ),
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
	onPush,
	onOpenPull,
	onUpdatePull,
};

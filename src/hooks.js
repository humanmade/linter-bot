const githubApi = require( 'github' );

const runForRepo = require( './run.js' );
const { getDiffMapping } = require( './diff' );
const { formatReview, formatSummary } = require( './format' );

const onPush = async context => {
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

module.exports = {
	onPush,
	onOpenPull,
};

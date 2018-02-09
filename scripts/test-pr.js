const githubApi = require( 'github' );

const runForRepo = require( '../src/run' );
const { getDiffMapping } = require( '../src/diff' );
const { formatReview, formatSummary } = require( '../src/format' );

const printUsage = () => {
	console.log( 'node test-commit.js <owner>/<repo> <pr>' );
	console.log( '  Run a specific PR via the linters for testing.' );
};

const main = argv => {
	const [ fullRepo, number ] = argv.slice( 2 );
	if ( ! fullRepo || ! number ) {
		printUsage();
		process.exit( 1 );
	}

	const [ owner, repo ] = fullRepo.split( '/' );
	if ( ! owner || ! repo ) {
		printUsage();
		process.exit( 1 );
	}

	const github = new githubApi();

	if ( process.env.HM_LINTER_GITHUB_TOKEN ) {
		github.authenticate( {
			type: 'token',
			token: process.env.HM_LINTER_GITHUB_TOKEN,
		} );
	}

	github.pullRequests.get( { owner, repo, number } )
		.then( ( { data } ) => {
			const commit = data.head.sha;
			const number = data.number;

			// Run the linter, and also fetch the PR diff.
			const pushConfig = { commit, owner, repo };
			return Promise.all( [
				runForRepo( pushConfig, github ),
				getDiffMapping( pushConfig, number, github ),
			] );
		})
		.then( ( [ state, mapping ] ) => {
			const summary = formatSummary( state );
			if ( state.passed ) {
				console.log( `Passed: ${ summary }` );
				return;
			}

			const review = formatReview( state, mapping );
			console.log( review.body );

			console.log( '\n----\n' );

			review.comments.map( comment => {
				console.log( `${ comment.path } @ ${ comment.position }:` );
				console.log( `  ${ comment.body }` );
			} );
		} )
		.catch( err => console.error( err ) );
};

main( process.argv );

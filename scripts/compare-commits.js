const githubApi = require( 'github' );

const run = require( '../src/run' );
const { formatComparison, formatReviewChange, formatSummary, resultsByFile } = require( '../src/format' );
const { compareRuns } = require( '../src/review' );

const printUsage = () => {
	console.log( 'node compare-commits.js <owner>/<repo> <commit1> <commit2>' );
	console.log( '  Compare linting from two commits or branches.' );
};

const main = async argv => {
	const [ fullRepo, firstCommit, secondCommit ] = argv.slice( 2 );
	if ( ! fullRepo || ! firstCommit || ! secondCommit ) {
		printUsage();
		process.exit( 1 );
	}

	const [ owner, repo ] = fullRepo.split( '/' );
	if ( ! owner || ! repo ) {
		printUsage();
		process.exit( 1 );
	}

	const commonConfig = { owner, repo };
	const github = new githubApi();

	if ( process.env.HM_LINTER_GITHUB_TOKEN ) {
		github.authenticate( {
			type: 'token',
			token: process.env.HM_LINTER_GITHUB_TOKEN,
		} );
	}

	const firstRun = await run(
		{ ...commonConfig, commit: firstCommit },
		github
	);
	const secondRun = await run(
		{ ...commonConfig, commit: secondCommit },
		github
	);

	console.log( `First: ${ formatSummary( firstRun ) }` );
	console.log( `Second: ${ formatSummary( secondRun ) }\n` );

	const comparison = compareRuns( firstRun, secondRun );
	const formatted = formatComparison( comparison );
	console.log( formatted );
};

main( process.argv );

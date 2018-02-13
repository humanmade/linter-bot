const githubApi = require( 'github' );

const run = require( '../src/run' );
const { formatSummary, resultsByFile } = require( '../src/format' );

const printUsage = () => {
	console.log( 'node test-commit.js <owner>/<repo> <commit>' );
	console.log( '  Run a specific commit or branch via the linters for testing.' );
};

const main = argv => {
	const [ fullRepo, commit ] = argv.slice( 2 );
	if ( ! fullRepo || ! commit ) {
		printUsage();
		process.exit( 1 );
	}

	const [ owner, repo ] = fullRepo.split( '/' );
	if ( ! owner || ! repo ) {
		printUsage();
		process.exit( 1 );
	}

	const pushConfig = {
		owner,
		repo,
		commit,
	};
	const github = new githubApi();

	if ( process.env.HM_LINTER_GITHUB_TOKEN ) {
		github.authenticate( {
			type: 'token',
			token: process.env.HM_LINTER_GITHUB_TOKEN,
		} );
	}

	run( pushConfig, github, true )
		.then( results => {
			const summary = formatSummary( results );
			if ( results.passed ) {
				console.log( `Passed: ${ summary }` );
				return;
			}

			console.log( `Failed: ${ summary }` );

			const byFile = resultsByFile( results.results );
			Object.keys( byFile ).forEach( file => {
				if ( Object.keys( byFile[ file ] ).length < 1 ) {
					return;
				}

				console.log( `${ file }:` );
				Object.keys( byFile[ file ] ).forEach( line => {
					console.log( `  L${ line }:` );
					byFile[ file ][ line ].forEach( error => {
						console.log( `    ${ error }` );
					} );
				} );
			} );
			process.exit( 2 );
		} )
		.catch( err => {
			console.error( err );
			process.exit( 3 );
		} );
};

main( process.argv );

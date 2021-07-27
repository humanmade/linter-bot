const fs = require( 'fs' );
const path = require( 'path' );
const pify = require( 'pify' );
const rimraf = require( 'rimraf' );
const realpath = pify( fs.realpath );

const { onAdd, onCheck, onPush, onOpenPull, onUpdatePull } = require( './hooks' );

const clean = async ( context ) => {
	// Clean up the tmp directories.
	const TEMP_DIR = process.env.TEMP_DIR || '/tmp'
	const { payload } = context;

	let { head_sha } = payload.check_suite || payload.check_run.check_suite;

	if ( ! head_sha && payload.pull_request ){
		head_sha = payload.pull_request.head.sha;
	}

	const owner = payload.repository.owner.login;
	const repo = payload.repository.name;
	const extractDir = path.join( await realpath( `${ TEMP_DIR }/repos` ), `${owner}-${repo}-${head_sha}` );

	console.log( `Cleaning up ${ extractDir }` );

	const rmrf = pify( rimraf );
	await rmrf( extractDir );
	await rmrf( `${ TEMP_DIR }/downloads` );
};

const withClean = func => ( args ) => {
	const context = args;
	func( args ).finally( () => {
		clean( context );
	});
}

module.exports = robot => {
	robot.on( 'installation_repositories.added', withClean( onAdd ) );
	robot.on( [ 'check_suite.requested', 'check_suite.rerequested' ], withClean( onCheck ) );
	robot.on( 'check_run.rerequested', withClean( onCheck ) );
	robot.on( 'pull_request.opened', withClean( onOpenPull ) );
	robot.on( 'pull_request.synchronize', withClean( onUpdatePull ) );
};

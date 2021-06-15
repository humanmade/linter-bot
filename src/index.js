const pify = require( 'pify' );
const rimraf = require( 'rimraf' );

const { onAdd, onCheck, onPush, onOpenPull, onUpdatePull } = require( './hooks' );

const clean = async () => {
	// Clean up the tmp directories.
	const TEMP_DIR = process.env.TEMP_DIR || '/tmp'
	console.log( `Cleaning up ${ TEMP_DIR }` );
	const rmrf = pify( rimraf );
	await rmrf( `${ TEMP_DIR }/downloads` );
	await rmrf( `${ TEMP_DIR }/repos` );
};
const withClean = func => ( ...args ) => func( ...args ).then( () => clean() );

module.exports = robot => {
	robot.on( 'installation_repositories.added', withClean( onAdd ) );
	robot.on( [ 'check_suite.requested', 'check_suite.rerequested' ], withClean( onCheck ) );
	robot.on( 'check_run.rerequested', withClean( onCheck ) );
	robot.on( 'pull_request.opened', withClean( onOpenPull ) );
	robot.on( 'pull_request.synchronize', withClean( onUpdatePull ) );
};

const fs = require( 'fs' );
const path = require( 'path' );
const pify = require( 'pify' );
const rimraf = require( 'rimraf' );
const realpath = pify( fs.realpath );

const { onAdd, onCheck, onPush, onOpenPull, onUpdatePull } = require( './hooks' );

const TEMP_DIR = process.env.TEMP_DIR || '/tmp'
const clean = async ( context ) => {
	const { payload } = context;
	let id, head_sha;

	if ( payload.check_suite ) {
		( { head_sha, id } = payload.check_suite );
	} else if ( payload.check_run && payload.check_run.check_suite ) {
		( { head_sha, id } = payload.check_run.check_suite );
	} else if( payload.pull_request ) {
		head_sha = payload.pull_request.head.sha;
		id = payload.pull_request.id;
	} else {
		throw 'No pull-request and commit data available for the request.';
	}

	const owner = payload.repository.owner.login;
	const repo = payload.repository.name;
	const extractDir = path.join( await realpath( `${ TEMP_DIR }/repos` ), `${owner}-${repo}-${head_sha}-${id}` );

	console.log( `Cleaning up ${ extractDir }` );

	const rmrf = pify( rimraf );
	await rmrf( extractDir );
	await rmrf( `${ TEMP_DIR }/downloads` );
};

const withClean = func => async ( args ) => {
	const context = args;
	const REPO_DIR = `${ TEMP_DIR }/repos`;
	await fs.promises.mkdir( REPO_DIR, { recursive: true } ); // Create recursive directory if root is not present.
	func( args ).finally( () => {
		clean( context );
	});
}

module.exports = robot => {
	robot.on( 'installation_repositories.added', withClean( onAdd ) );
	robot.on( [ 'check_suite.requested', 'check_suite.rerequested' ], withClean( onCheck ) );
	robot.on( 'check_run.rerequested', withClean( onCheck ) );
	robot.on( [ 'pull_request.opened', 'pull_request.reopened' ], withClean( onCheck ) );
};

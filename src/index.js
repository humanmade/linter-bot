const { onAdd, onCheck, onPush, onOpenPull, onUpdatePull } = require( './hooks' );

module.exports = robot => {
	robot.on( 'installation_repositories.added', onAdd );
	robot.on( [ 'check_suite.requested', 'check_suite.rerequested' ], onCheck );
	robot.on( 'push', onPush );
	robot.on( 'pull_request.opened', onOpenPull );
	robot.on( 'pull_request.synchronize', onUpdatePull );
};

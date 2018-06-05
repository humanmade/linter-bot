const { onAdd, onCheck, onPush, onOpenPull, onUpdatePull } = require( './hooks' );

module.exports = robot => {
	robot.on( 'installation_repositories.added', onAdd );
	robot.on( [ 'check_suite.requested', 'check_suite.rerequested' ], onCheck );
	robot.on( 'check_run.rerequested', onCheck );
	robot.on( 'pull_request.opened', onOpenPull );
	robot.on( 'pull_request.synchronize', onUpdatePull );
};

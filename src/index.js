const { onPush, onOpenPull } = require( './hooks' );

module.exports = robot => {
	robot.on( 'push', onPush );
	robot.on( 'pull_request.opened', onOpenPull );
	// robot.on( 'pull_request.synchronize', )
};

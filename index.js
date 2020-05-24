const { probot } = require( '@humanmade/probot-util' );

// Probot setup
const bot = probot.create();

// Load Probot plugins from the `./src` folder
bot.load( require( './src' ) );

// Lambda Handler
const handler = probot.buildHandler( bot );
module.exports.probotHandler = function ( event, context, callback ) {
	switch ( event.path ) {
		// Pass check requests to HTTP.
		case '/check':
			const http = require( './src/http' );
			http( event, context, callback )
				.then( res => callback( null, res ) )
				.catch( err => callback( err ) );
			return;

		default:
			return handler( event, context, callback );
	}
};

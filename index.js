const { probot } = require( '@humanmade/probot-util' );

// Probot setup
const bot = probot.create();

// Load Probot plugins from the `./src` folder
bot.load( require( './src' ) );

// Lambda Handler
module.exports.probotHandler = probot.buildHandler( bot );

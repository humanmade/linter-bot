require( 'babel-polyfill' );

const { probot } = require( '@humanmade/probot-util' );

// Probot setup
const bot = probot.create();

// Load Probot plugins from the `./build` folder
bot.load( require( './build' ) );

// Lambda Handler
module.exports.probotHandler = probot.buildHandler( bot );

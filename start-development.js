const { probot } = require( '@humanmade/probot-util' );

// Probot setup
const bot = probot.create();

bot.load( require( './src' ) );
bot.start();

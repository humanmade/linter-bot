require( 'babel-polyfill' );

const { probot } = require( '@humanmade/probot-util' );
const path = require( 'path' );

process.env['PATH'] = process.env['PATH'] + ':' + path.join( __dirname, 'bin' );

// Probot setup
const bot = probot.create();

bot.load( require( './src' ) );
bot.start();

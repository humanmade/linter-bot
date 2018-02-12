require( 'babel-polyfill' );

const fs = require('fs')
const path = require( 'path' );

const mainPlugin = require( './src' );

const cert = fs.readFileSync( 'development.private-key.pem', 'utf8' );

process.env['PATH'] = process.env['PATH'] + ':' + path.join( __dirname, 'bin' );

// Probot setup
const createProbot = require( './probot/lib' );
const probot = createProbot( {
	id: 8936,
	secret: 'development',
	cert: cert,
	port: 0,
	webhookProxy: 'https://smee.io/rpFoxbfDjkw5Srji',
} );

probot.load( mainPlugin );
probot.start();
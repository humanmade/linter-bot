const fs = require( 'fs' );
const jwt = require( 'jsonwebtoken' );
const Octokit = require( '@octokit/rest' );

const id = process.env.APP_ID || 8936;
const certName = id === 8936 ? 'development.private-key.pem' : 'private-key.pem';
const cert = fs.readFileSync( certName, 'utf8' );

function createToken() {
	const payload = {
		exp: Math.floor( Date.now() / 1000 ) + 60,  // JWT expiration time
		iat: Math.floor( Date.now() / 1000 ),       // Issued at time
		iss: id                                     // GitHub App ID
	};

	// Sign with RSA SHA256
	return jwt.sign( payload, cert, { algorithm: 'RS256' } );
}

function createClient() {
	const github = new Octokit();
	github.authenticate( {
		type: 'integration',
		token: createToken(),
	} );

	return github;
}

module.exports = {
	createClient,
};

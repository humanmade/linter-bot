/**
 * HTTP handler.
 *
 * This handler is responsible for handling web requests from lint-check.
 */
const fs = require( 'fs' );
const path = require( 'path' );
const pify = require( 'pify' );

const prepareLinters = require( './linters' );
const { combineLinters } = require( './util' );

class ClientError extends Error {
	statusCode = 400;
	code = null;

	constructor( code, message ) {
		super( message );
		this.code = code;
	}
}

const CORS_HEADERS = {
	'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
	'Access-Control-Allow-Methods': 'DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT',
	'Access-Control-Allow-Origin': '*',
};

module.exports = async ( event, context ) => {
	console.log( event );
	try {
		if ( ! event.body ) {
			console.log( 'no body' );
			throw new ClientError( 'no_body', 'Missing body.' );
		}

		const data = new URLSearchParams( event.body );;
		let filename = data.get( 'filename' );

		// Set default filename based on type.
		if ( ! filename ) {
			switch ( data.get( 'type' ) ) {
				case 'php':
				case 'js':
				case 'css':
					filename = `file.${ data.get( 'type' ) }`;
					break;

				default:
					throw new ClientError( 'invalid_type', 'Invalid type.' );
			}
		}

		// Sanitize inputs.
		const sanitizedFilename = filename.replace( /[^a-z0-9_\-.\/]+/gi, '' ).replace( /\.\//gi, '' );
		if ( sanitizedFilename !== filename ) {
			console.warn( 'Attempt to escape root' );
			console.log( filename );
			throw new ClientError( 'no_file', 'Invalid filename.' );
		}

		// First, save the input to a dummy file.
		const dir = await pify( fs.mkdtemp )( '/tmp/lint' );

		// If it's in a subfolder, make those.
		const fnParts = sanitizedFilename.split( '/' );
		if ( fnParts.length > 1 ) {
			let baseDir = dir;
			while ( fnParts.length > 1 ) {
				const nextPart = fnParts.shift();
				if ( nextPart === '..' || nextPart === '.' ) {
					console.warn( 'Attempt to escape root' );
					console.log( filename );
					throw new ClientError( 'invalid_path', 'Invalid path part' );
				}

				baseDir = path.join( baseDir, nextPart );
				await pify( fs.mkdir )( baseDir );
			}
		}

		// Write code to the path.
		const res = await pify( fs.writeFile )( path.join( dir, sanitizedFilename ), data.get( 'code' ) );
		console.log( path.join( dir, sanitizedFilename ), res );

		// Then, prepare the linters.
		const config = {
			version: data.get( 'version' ) || 'latest',
			phpcs: {
				enabled: true,
				version: 'inherit',
			},
			eslint: {
				enabled: true,
				version: 'inherit',
			},
			stylelint: {
				enabled: false,
				version: 'inherit',
			},
		};
		const linters = await prepareLinters( Promise.resolve( config ) );

		// Run the linters.
		const results = await Promise.all( linters.map( linter => linter( dir ) ) );

		// Combine results.
		const combined = combineLinters( results );

		// return results;
		return {
			statusCode: 200,
			headers: CORS_HEADERS,
			body: JSON.stringify( combined ),
		};
	} catch ( err ) {
		console.log( err );
		return {
			statusCode: err.statusCode || 500,
			headers: CORS_HEADERS,
			body: JSON.stringify( {
				error: err.code || 'unknown',
				message: err.message || '' + err,
			} ),
		};
	}
};
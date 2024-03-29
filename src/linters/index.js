const probotUtil = require( '@humanmade/probot-util' );
const fs = require( 'fs' );
const https = require( 'https' );
const tar = require( 'tar' );

const available = {
	eslint: require( './eslint' ),
	phpcs: require( './phpcs' ),
	stylelint: require( './stylelint' ),
};
const enabled = ( process.env.ENABLED_LINTERS || 'eslint,phpcs,stylelint' ).split( ',' );
const TEMP_DIR = process.env.TEMP_DIR || '/tmp'
const STANDARDS_DIR = `${ TEMP_DIR }/hmlinter-standards`;
const BASE_URL = process.env.STANDARD_URL || 'https://make.hmn.md/hmlinter/standards';

/**
 * Send a HTTP request.
 *
 * Promisified version of Node's https.get
 *
 * @param args Arguments available to https.get. See https://nodejs.org/api/https.html#https_https_get_url_options_callback
 * @returns {Promise<any>}
 */
const httpGet = ( ...args ) => {
	return new Promise( ( resolve, reject ) => {
		const req = https.get( ...args, res => {
			const data = [];

			res.on( 'data', chunk => data.push( chunk ) );
			res.on( 'end', () => {
				resolve( { ...res, body: Buffer.concat( data ) } );
			} );
		} );
		req.on( 'error', err => reject( err ) );
	} );
};

/**
 * Download an external standards file.
 *
 * @param {String} url      URL of the file to download.
 * @param {String} filename Local filename to save to.
 * @returns {Promise<*>}
 */
const downloadFile = async ( url, filename ) => {
	await probotUtil.file.ensureDirectory( STANDARDS_DIR );

	console.log( `Fetching ${ url }` );
	const res = await httpGet( url );

	if ( res.statusCode !== 200 ) {
		throw new Error( `Could not fetch ${ url }: ${ res.statusCode } ${ res.statusReason }` );
	}

	console.log( `Saving to ${ filename }` );
	return await probotUtil.file.saveDownloadedFile( res.body, filename );
};

/**
 * Download and build a linter instance.
 *
 * @param {String} linter  Which linter to setup.
 * @param {String} version Standards version to use.
 * @returns {Promise<*>}
 */
const prepareLinter = async ( linter, version ) => {
	const filename = `${ linter }-${ version }.tar.gz`;
	const url = `${ BASE_URL }/${ filename }`;
	const directory = `${ STANDARDS_DIR }/${ linter }-${ version }`;

	console.log( `Downloading ${ linter } standard from ${ url }` );
	const tarball = await downloadFile( url, filename );

	console.log( `Extracting standard to ${ directory }` );

	await probotUtil.file.ensureDirectory( directory );

	const extracted = await tar.extract( {
		cwd: directory,
		file: tarball,
	} );

	fs.unlink( tarball, () => {} );

	const buildLinter = available[ linter ];
	return buildLinter( `${ directory }/` );
};

/**
 * Run all linters.
 *
 * @param {Promise} configPromise
 * @returns {Promise<any[]>}
 */
module.exports = async configPromise => {
	// Ensure we actually have the config.
	const config = await configPromise;

	console.log( 'Preparing linters using config:' );
	console.log( config );

	const linters = Object.keys( available ).map( type => {
		if ( enabled.indexOf( type ) === -1 ) {
			console.log( `Skipping ${ type }, not enabled in ENABLED_LINTERS` );
			return null;
		}

		const lintConfig = config[ type ] || {};
		if ( ! lintConfig.enabled ) {
			return null;
		}

		const version = lintConfig.version === 'inherit' ? config.version : ( lintConfig.version || config.version );

		// Download and extract the linter in the background.
		const linterPromise = prepareLinter( type, version );

		// Ensure we don't trigger any uncaught exception errors.
		linterPromise.catch( err => console.log( `Error setting up ${ type }` ) );

		return async ( ...args ) => {
			// Only await when needed.
			const linter = await linterPromise;
			return linter( ...args );
		};
	} );

	return linters.filter( Boolean );
};

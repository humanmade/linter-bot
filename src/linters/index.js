const fs = require( 'fs' );
const https = require( 'https' );
const pify = require( 'pify' );
const tar = require( 'tar' );

const { saveDownloadedFile } = require( '../util' );

const available = {
	eslint: require( './eslint' ),
	phpcs: require( './phpcs' ),
};

const STANDARDS_DIR = '/tmp/hmlinter-standards';
const BASE_URL = 'https://make.hmn.md/hmlinter/standards';

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

const downloadFile = async ( url, filename ) => {
	if ( ! fs.existsSync( STANDARDS_DIR ) ) {
		await pify( fs.mkdir )( STANDARDS_DIR );
	}

	console.log( `Fetching ${ url }` );
	const res = await httpGet( url );

	if ( res.statusCode !== 200 ) {
		throw new Error( `Could not fetch ${ url }: ${ res.statusCode } ${ res.statusReason }` );
	}

	console.log( `Saving to ${ filename }` );
	return await saveDownloadedFile( res.body, filename );
};

const prepareLinter = async ( linter, version ) => {
	const filename = `${ linter }-${ version }.tar.gz`;
	const url = `${ BASE_URL }/${ filename }`;
	const directory = `${ STANDARDS_DIR }/${ linter }-${ version }`;

	console.log( `Downloading ${ linter } standard from ${ url }` );
	const tarball = await downloadFile( url, filename );

	console.log( `Extracting standard to ${ directory }` );

	if ( ! fs.existsSync( directory ) ) {
		await pify( fs.mkdir )( directory );
	}

	const extracted = await tar.extract( {
		cwd: directory,
		file: tarball,
	} );

	fs.unlink( tarball, () => {} );

	const buildLinter = available[ linter ];
	return buildLinter( `${ directory }/` );
};

module.exports = async configPromise => {
	// Ensure we actually have the config.
	const config = await configPromise;

	console.log( 'Preparing linters using config:' );
	console.log( config );

	const linters = Object.keys( available ).map( type => {
		const lintConfig = config[ type ] || {};
		if ( ! lintConfig.enabled ) {
			return null;
		}

		const version = lintConfig.version === 'inherit' ? config.version : ( lintConfig.version || config.version );

		// Download and extract the linter in the background.
		const linterPromise = prepareLinter( type, version );

		return async ( ...args ) => {
			// Only await when needed.
			const linter = await linterPromise;
			return linter( ...args );
		};
	} );

	return linters.filter( Boolean );
};

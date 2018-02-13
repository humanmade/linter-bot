const fs = require( 'fs' );
const https = require( 'https' );
const path = require( 'path' );
const pify = require( 'pify' );
const rimraf = require( 'rimraf' );
const tar = require( 'tar' );

const realpath = pify( fs.realpath );

const linters = require( './linters' );

const DOWNLOAD_DIR = '/tmp/downloads';
const REPO_DIR = '/tmp/repos';

[ DOWNLOAD_DIR, REPO_DIR ].forEach( dir => {
	try {
		fs.mkdir( dir, () => {} );
	}
	catch ( e ) {
		console.log( e );
	}
} );

const downloadFile = ( url, filename ) => {
	const downloadPath = path.join( DOWNLOAD_DIR, filename );
	const handle = fs.createWriteStream( downloadPath );

	return new Promise( ( resolve, reject ) => {
		const httpHandle = https.get( url, resp => {
			resp.pipe( handle );
			handle.on( 'finish', () => {
				handle.close( () => resolve( downloadPath ) );
			} );
		} );
		httpHandle.on( 'error', err => {
			fs.unlink( downloadPath );
			return reject( err );
		} );
		handle.on( 'error', err => {
			fs.unlink( downloadPath );
			return reject( err );
		} );
	} );
};

module.exports = async ( pushConfig, github ) => {
	const { commit, owner, repo } = pushConfig;

	// Don't follow redirects for this request.
	github.config.followRedirects = false;
	const archiveURLResult = await github.repos.getArchiveLink( {
		owner,
		repo,
		archive_format: 'tarball',
		ref:            pushConfig.commit,
	});
	const archiveURL = archiveURLResult.meta.location;
	// Reset redirect config.
	delete github.config.followRedirects;

	const filename = `${owner}-${repo}-${commit}.tar.gz`;
	const tarball = await downloadFile( archiveURL, filename );

	const extractDir = path.join( await realpath( REPO_DIR ), `${owner}-${repo}-${commit}` );
	try {
		await pify( fs.mkdir )( extractDir );
	} catch ( e ) {
		// Ignore if it already exists.
	}

	const extracted = await tar.extract( {
		cwd:    extractDir,
		file:   tarball,
		strip:  1,
		filter: path => ! path.match( /\.(jpg|jpeg|png|gif|woff|swf|flv|fla|woff|svg|otf||ttf|eot|swc|xap)$/ ),
	} );

	// Delete the now-unneeded tarball.
	fs.unlink( tarball, () => {} );

	// Now that we have the code, start linting!
	const results = await Promise.all( linters.map( linter => linter( extractDir, pushConfig ) ) );

	// Remove the temporary directory.
	await pify( rimraf )( extractDir );

	// Calculate totals across all tools.
	const totals = results.reduce( ( totals, result ) => {
		if ( result.totals.errors ) {
			totals.errors += result.totals.errors;
		}
		if ( result.totals.warnings ) {
			totals.warnings += result.totals.warnings;
		}
		return totals;
	}, { errors: 0, warnings: 0 } );

	return { totals, passed: totals.errors === 0, results };
};

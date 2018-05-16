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

const saveDownloadedFile = ( buffer, filename ) => {
	const downloadPath = path.join( DOWNLOAD_DIR, filename );
	return new Promise( ( resolve, reject ) => {
		const handle = fs.createWriteStream( downloadPath );
		handle.end( buffer, () => {
			handle.close( () => resolve( downloadPath ) );
		} );
	} );
};

const downloadRepo = async ( extractDir, pushConfig, github ) => {
	const { commit, owner, repo } = pushConfig;

	console.log( 'Downloading archive to', extractDir );

	const filename = `${owner}-${repo}-${commit}.tar.gz`;
	const archive = await github.repos.getArchiveLink( {
		owner,
		repo,
		archive_format: 'tarball',
		ref:            commit,
	});

	const tarball = await saveDownloadedFile( archive.data, filename );

	try {
		await pify( fs.mkdir )( extractDir );
	} catch ( e ) {
		// Ignore if it already exists.
	}

	console.log( 'Extracting archive to dir' );
	const extracted = await tar.extract( {
		cwd:   extractDir,
		file:  tarball,
		strip: 1,
		filter: path => ! path.match( /\.(jpg|jpeg|png|gif|woff|swf|flv|fla|woff|svg|otf||ttf|eot|swc|xap)$/ ),
	} );
	console.log( 'Completed extraction.' );

	// Delete the now-unneeded tarball.
	fs.unlink( tarball, () => {} );
};

module.exports = async ( pushConfig, github, allowReuse = false ) => {
	const { commit, owner, repo } = pushConfig;

	const extractDir = path.join( await realpath( REPO_DIR ), `${owner}-${repo}-${commit}` );

	if ( ! allowReuse || ! fs.existsSync( extractDir ) ) {
		await downloadRepo( extractDir, pushConfig, github );
	}

	// Now that we have the code, start linting!
	const results = await Promise.all( linters.map( linter => linter( extractDir, pushConfig ) ) );

	if ( ! allowReuse ) {
		// Remove the temporary directory.
		await pify( rimraf )( extractDir );
	}

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

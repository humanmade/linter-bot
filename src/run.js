const probotUtil = require( '@humanmade/probot-util' );
const fs = require('graceful-fs');
const https = require( 'https' );
const path = require( 'path' );
const pify = require( 'pify' );
const rimraf = require( 'rimraf' );
const tar = require( 'tar' );

const realpath = pify( fs.realpath );

const getLinters = require( './linters' );
const TEMP_DIR = process.env.TEMP_DIR || '/tmp'
const REPO_DIR = `${ TEMP_DIR }/repos`;

module.exports = async ( pushConfig, config, github, allowReuse = false ) => {
	const { commit, owner, repo, id } = pushConfig;

	// Start setting up the linters.
	const linterPromise = getLinters( config );

	await probotUtil.file.ensureDirectory( REPO_DIR );
	const extractDir = path.join( await realpath( REPO_DIR ), `${owner}-${repo}-${commit}-${id}` );

	if ( ! allowReuse || ! fs.existsSync( extractDir ) ) {
		await probotUtil.repo.download( extractDir, pushConfig, github );
	}

	// Now that we have the code, start linting!
	const linters = await linterPromise;
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

	return {
		passed: totals.errors === 0 && totals.warnings === 0,
		totals,
		results,
	};
};

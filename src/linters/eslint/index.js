const fs = require( 'fs' );
const Module = require( 'module' );
const path = require( 'path' );
const moduleAlias = require( 'module-alias' );

/**
 * Format message data into a consistent format for usage in formatOutput.
 *
 * @param {Object} message Raw message data from eslint.
 * @returns {Object}
 */
const formatMessage = message => {
	return {
		line:     message.line,
		column:   message.column,
		severity: message.severity >= 2 ? 'error' : 'warning',
		message:  message.message,
		source:   message.ruleId,
	};
};

/**
 * Organize all output from eslint for Linter ingestion.
 *
 * @param {Object} data     Warnings and errors from eslint.
 * @param {String} codepath Path to the code getting linted.
 * @returns {{files, totals: {warnings: *, errors: *}}}
 */
const formatOutput = ( data, codepath ) => {
	const totals = {
		errors:   data.errorCount,
		warnings: data.warningCount,
	};
	const files = {};
	// console.log( data );
	data.results.forEach( result => {
		// Exclude any empty files.
		if ( ! result.messages.length ) {
			return;
		}

		const relPath = path.relative( codepath, result.filePath );
		files[ relPath ] = result.messages.map( formatMessage );
	} );

	return { totals, files };
};

/**
 * Run the ESLint engine against the given path.
 *
 * Handles ignoring any errors that aren't relevant.
 *
 * @param {Object} engine ESLint engine instance.
 * @param {String} codepath Path to run linter on.
 * @return {Object} ESLint results object.
 */
const run = ( engine, codepath ) => {
	try {
		return engine.executeOnFiles( [ codepath ] );
	} catch ( err ) {
		switch ( err.messageTemplate ) {
			case 'file-not-found':
			case 'all-files-ignored':
				// No JS files in the repo! Ignore this, as it's not really
				// an error.
				return {
					errorCount: 0,
					warningCount: 0,
					results: [],
				};

			default:
				throw err;
		}
	}
};

/**
 * ESLint standard to use when running eslint.
 *
 * This can be customized by setting the DEFAULT_STANDARD_ESLINT environment variable.
 *
 * @type {string}
 */
const DEFAULT_STANDARD = process.env.DEFAULT_STANDARD_ESLINT || 'eslint-config-humanmade';

/**
 * Run eslint linting.
 *
 * @param {String} standardPath Path to custom standard set.
 * @returns {function(*=): Promise<any>}
 */
module.exports = standardPath => codepath => {
	const options = {
		cwd: codepath,
	};

	// We need to use node_modules from the standard directory, but because
	// we're not invoking eslint over the CLI, we can't change where `require()`
	// loads modules from unless we override the module loader.
	//
	// This ensures dependencies load from the standards instead, and the
	// standard itself is loaded from the right place.
	moduleAlias.addPath( `${ standardPath }/node_modules` );
	moduleAlias.addAlias( DEFAULT_STANDARD, standardPath );

	const actualStandardPath = require.resolve( DEFAULT_STANDARD );
	const origFindPath = Module._findPath;
	Module._findPath = ( name, ...args ) => {
		const path = origFindPath( name, ...args );
		if ( ! path && name === DEFAULT_STANDARD ) {
			return actualStandardPath;
		}
		return path;
	};

	const { CLIEngine } = require( 'eslint' );
	const engine = new CLIEngine( options );

	return new Promise( ( resolve, reject ) => {
		let output;
		try {
			output = run( engine, codepath );
		} catch ( err ) {
			if ( err.messageTemplate === 'no-config-found' ) {
				// Try with default configuration.
				const engine = new CLIEngine( { ...options, configFile: `${ standardPath }/index.js` } );
				console.log( 'Running eslint with default config on path', codepath );
				output = run( engine, codepath );
			} else {
				console.log( err );
				throw err;
			}
		}

		// Reset path loader.
		moduleAlias.reset();
		Module._findPath = origFindPath;

		resolve( formatOutput( output, codepath ) );
	} );
};

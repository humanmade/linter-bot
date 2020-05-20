const fs = require( 'fs' );
const Module = require( 'module' );
const process = require( 'process' );
const moduleAlias = require( 'module-alias' );
const path = require( 'path' );

/**
 * Convert an error message from the stylelint format into one acceptable for GitHub
 *
 * @param {Object} message Data about a warning from stylelint.
 * @returns {Object}
 */
const formatMessage = message => ( {
	line: message.line,
	column: message.column,
	severity: message.severity,
	message: message.text,
	source: message.rule,
} );

/**
 * Fetch a count of the total errors and warnings for our response.
 *
 * @param {Object} files Formatted warnings against specific files.
 * @returns {{warnings: number, errors: number}}
 */
const getTotals = ( files ) => {
	const allErrors = Object.keys( files ).reduce( ( acc, key ) => [ ...acc, ...files[ key ] ], [] );

	return {
		errors: allErrors.filter( errorData => errorData.severity === 'error' ).length,
		warnings: allErrors.filter( errorData => errorData.severity === 'warning' ).length,
	};
};

/**
 * Properly Format the return for GitHub.
 *
 * @param {Object} data Raw data from stylelint Node runner.
 * @param {String} codepath Path against which to check files.
 * @returns {{files: {}, totals: {warnings: number, errors: number}}}
 */
const formatOutput = ( data, codepath ) => {
	const files = {};

	// There were no errors, simply bounce.
	if ( ! data.errored ) {
		return {
			totals: 0,
			files: [],
		};
	}

	data.results.forEach( result => {
		// Only parse through CSS or SCSS files.
		if ( ! result.source.match( /\.s?css$/ ) ) {
			return;
		}

		// Exclude any empty files.
		if ( ! result.warnings.length ) {
			return;
		}

		const relPath = path.relative( codepath, result.source );
		files[ relPath ] = result.warnings.map( formatMessage );
	} );

	return {
		totals: getTotals( files ),
		files,
	};
};

/**
 * Run stylelint checks.
 *
 * @param {String} standardPath Path against which to check files.
 * @returns {() => Promise}
 */
module.exports = standardPath => codepath => {
	const options = {
		files: codepath,
		configBasedir: `${ standardPath }node_modules`
	};

	// stylelint use `resolve-from` internally which looks at specific directories only for configs.
	// We need to copy the files for our standard to the node_modules directory so that stylelint
	// can correctly find our standard alongside the others.
	//
	// Copying the stylelint files so that stylelint can find and use our standard set alongside the others.
	const actualStandardPath = `${ standardPath }/node_modules/@humanmade/stylelint-config`;
	fs.mkdir( actualStandardPath, { recursive: true }, () => {
		fs.copyFileSync( `${ standardPath }/package.json`, `${ actualStandardPath }/package.json` );
		fs.copyFileSync( `${ standardPath }/.stylelintrc.json`, `${ actualStandardPath }/.stylelintrc.json` );
	} );

	moduleAlias.addAlias( '@runner-packages', `${ standardPath }node_modules` );

	const { lint } = require( '@runner-packages/stylelint' );

	const oldCwd = process.cwd();
	try {
		process.chdir( codepath );
		console.log( '----- Cwd', process.cwd() );
	} catch {
		console.log( '----- Directory change failed' );
	}

	return new Promise( resolve => {
		let output;

		output = lint( options )
			.then( resultObject => formatOutput( resultObject, codepath ) )
			.catch( error => {

				// code 78 is a configuration not found, which means we can't access @humanmade/stylelint-config.
				// Run with our default configuration; most projects only use this anyway.
				if ( error.code === 78 ) {
					console.log( 'Running stylelint with default config on path', codepath );

					return lint( { ...options, configFile: `${ standardPath }/.stylelintrc.json` } )
						.then( resultObject => formatOutput( resultObject, codepath ) );
				} else {
					console.log( error );
					throw error;
				}
			} );

		// Reset path loader.
		moduleAlias.reset();
		process.chdir( oldCwd );

		resolve( output );
	} );
};

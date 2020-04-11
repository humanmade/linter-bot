const Module = require( 'module' );
const path = require( 'path' );
const moduleAlias = require( 'module-alias' );

/**
 * Convert an error message from the stylelint format into one acceptable for GitHub
 *
 * @param {Object} message Data about a warning from stylelint.
 * @returns {Object}
 */
const formatMessage = message => ( {
	line:     message.line,
	column:   message.column,
	severity: message.severity,
	message:  message.text,
	source:   message.rule,
} );

/**
 * Fetch a count of the total errors and warnings for our response.
 *
 * @param {Object} files Formatted warnings against specific files.
 * @returns {{warnings: number, errors: number}}
 */
const getTotals = ( files ) => {
	const allErrors = Object.keys( files )
		.reduce( ( accumulator, key ) => accumulator.concat( [ ...files[key] ] ), [] );

	return {
		errors:   allErrors.filter( errorData => errorData.severity === 'error' ).length,
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

	return { totals: getTotals( files ), files };
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
	};

	// We need to use node_modules from the standard directory, but because
	// we're not invoking stylelint over the CLI, we can't change where `require()`
	// loads modules from unless we override the module loader.
	//
	// This ensures dependencies load from the standards instead, and the
	// standard itself is loaded from the right place.
	moduleAlias.addAlias( '@runner-packages', `${ standardPath }node_modules` );
	moduleAlias.addAlias( '@humanmade/stylelint-config', standardPath );

	const actualStandardPath = require.resolve( '@humanmade/stylelint-config' );
	const origFindPath = Module._findPath;
	Module._findPath = ( name, ...args ) => {
		const path = origFindPath( name, ...args );
		if ( ! path && name === '@humanmade/stylelint-config' ) {
			return actualStandardPath;
		}
		return path;
	};

	const { lint } = require( '@runner-packages/stylelint' );

	return new Promise( resolve => {
		let data;

		try {
			data = lint( { ...options, configFile: `${ standardPath }/.stylelintrc.json` } )
		} catch ( err ) {
			console.log( err );
			throw err;
		}

		const output = data.then(resultObject => formatOutput( resultObject, codepath ));

		// Reset path loader.
		moduleAlias.reset();
		Module._findPath = origFindPath;

		resolve( output );
	} );
};

const fs = require( 'fs' );
const Module = require( 'module' );
const path = require( 'path' );
const moduleAlias = require( 'module-alias' );

const formatMessage = message => {
	return {
		line:     message.line,
		column:   message.column,
		severity: message.severity >= 2 ? 'error' : 'warning',
		message:  message.message,
		source:   message.ruleId,
	};
};

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
	moduleAlias.addAlias( 'eslint-config-humanmade', standardPath );

	const actualStandardPath = require.resolve( 'eslint-config-humanmade' );
	const origFindPath = Module._findPath;
	Module._findPath = ( name, ...args ) => {
		const path = origFindPath( name, ...args );
		if ( ! path && name === 'eslint-config-humanmade' ) {
			return actualStandardPath;
		}
		return path;
	};

	const { CLIEngine } = require( 'eslint' );
	const engine = new CLIEngine( options );

	return new Promise( ( resolve, reject ) => {
		let output;
		try {
			output = engine.executeOnFiles( [ codepath ] );
		} catch ( err ) {
			if ( err.messageTemplate === 'no-config-found' ) {
				// Try with default configuration.
				const engine = new CLIEngine( { ...options, configFile: `${ standardPath }/index.js` } );
				console.log( 'Running eslint with default config on path', codepath );
				output = engine.executeOnFiles( [ codepath ] );
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

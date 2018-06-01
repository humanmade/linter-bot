const fs = require( 'fs' );
const Module = require( 'module' );
const path = require( 'path' );

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

	// SUPER-HACK!
	// We need to use node_modules from the standard directory, but because
	// we're not invoking eslint over the CLI, we can't change where `require()`
	// loads modules from unless we override the env and re-init Module.
	//
	// This is technically Node-internal behaviour, but it works.
	const prevPath = process.env.NODE_PATH;
	process.env.NODE_PATH = `${ standardPath }/node_modules`;
	Module._initPaths();

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

		// Undo SUPER-HACK!
		process.env.NODE_PATH = prevPath;
		Module._initPaths();

		resolve( formatOutput( output, codepath ) );
	} );
};

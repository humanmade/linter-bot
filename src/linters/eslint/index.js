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

		resolve( formatOutput( output, codepath ) );
	} );
};

const { CLIEngine } = require( 'eslint' );
const fs = require( 'fs' );
const path = require( 'path' );

const DEFAULT_CONFIG = path.join( __dirname, '..', 'phpcs', 'vendor', 'humanmade', 'coding-standards', '.eslintrc.yml' );

const formatMessage = message => {
	return {
		line:     message.line,
		column:   message.column,
		severity: message.severity === 5 ? 'error' : 'warning',
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
		const relPath = path.relative( codepath, result.filePath );
		files[ relPath ] = result.messages.map( formatMessage );
	} );

	return { totals, files };
};

module.exports = codepath => {
	const options = {
		cwd: codepath,
	};
	const engine = new CLIEngine( options );

	let output;
	try {
		output = engine.executeOnFiles( [ codepath ] );
	} catch ( err ) {
		if ( err.messageTemplate === 'no-config-found' ) {
			// Try with default configuration.
			const engine = new CLIEngine( { ...options, configFile: DEFAULT_CONFIG } );
			output = engine.executeOnFiles( [ codepath ] );
		} else {
			console.log( err );
			throw err;
		}
	}
	return formatOutput( output, codepath );
};

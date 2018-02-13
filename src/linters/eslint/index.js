const fs = require( 'fs' );
const Module = require( 'module' );
const path = require( 'path' );

const EXTRA_MODULE_PATHS = [
	path.join( __dirname, '..', 'phpcs', 'vendor', 'humanmade', 'coding-standards', 'node_modules' ),
	path.join( __dirname, '..', 'phpcs', 'vendor', 'humanmade', 'coding-standards', 'packages' ),
];
const DEFAULT_CONFIG = path.join( __dirname, '..', 'phpcs', 'vendor', 'humanmade', 'coding-standards', '.eslintrc.yml' );

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

module.exports = codepath => {
	const options = {
		cwd: codepath,
	};

	// SUPER-HACK!
	const prevPath = process.env.NODE_PATH;
	process.env.NODE_PATH = EXTRA_MODULE_PATHS.join( path.delimiter );
	Module._initPaths();

	const { CLIEngine } = require( 'eslint' );
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

	// Undo SUPER-HACK!
	process.env.NODE_PATH = prevPath;
	Module._initPaths();

	return formatOutput( output, codepath );
};

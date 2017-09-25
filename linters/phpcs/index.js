const child_process = require( 'child_process' );
const fs = require( 'fs' );
const path = require( 'path' );

const PHPCS_PATH = path.join( __dirname, 'vendor', 'bin', 'phpcs' );
const CONFIG_NAMES = [
	'phpcs.xml',
	'phpcs.ruleset.xml',
];
const DEFAULT_CONFIG = path.join( __dirname, 'vendor', 'humanmade', 'coding-standards' );

const formatMessage = message => {
	const details = `<details><summary>Error details</summary><code>${message.source}</code> from phpcs</details>`;
	const text = `${message.message}`;

	return {
		line:     message.line,
		column:   message.column,
		severity: message.severity === 5 ? 'error' : 'warning',
		message:  text,
	};
};

const formatOutput = ( data, codepath ) => {
	const totals = {
		errors:   data.totals.errors,
		warnings: data.totals.warnings,
	};
	const files = {};
	Object.keys( data.files ).forEach( file => {
		const relPath = path.relative( codepath, file );
		files[ relPath ] = data.files[ file ].messages.map( formatMessage );
	} );

	return { totals, files };
};

module.exports = async codepath => {
	// Detect a ruleset file if we can, otherwise use default.
	const rulesetFiles = await Promise.all( CONFIG_NAMES.map( filename => {
		return new Promise( resolve => {
			fs.access( path.join( codepath, filename ), err => {
				resolve( err ? null : filename );
			} );
		} );
	} ) );
	const standard = rulesetFiles.find( file => !! file ) || DEFAULT_CONFIG;
	console.log( standard );

	// const standard = 'PSR2'; //...
	const args = [
		`--standard=${standard}`,
		'--report=json',
		codepath
	];
	const opts = {
		cwd: __dirname,
		env: process.env,
	};

	return await new Promise( ( resolve, reject ) => {
		const proc = child_process.spawn( PHPCS_PATH, args, opts );
		let stdout = '';
		let stderr = '';
		proc.stdout.on( 'data', data => stdout += data );
		proc.stderr.on( 'data', data => stderr += data );
		proc.on( 'close', errCode => {
			// 0 => no errors, 1 => errors, 2 => other
			if ( errCode > 1 ) {
				return reject( stderr || stdout );
			}

			let data;
			try {
				data = JSON.parse( stdout );
			} catch ( e ) {
				// Couldn't decode JSON, so likely a human readable error.
				return reject( stdout );
			}

			resolve( formatOutput( data, codepath ) );
		} );
	} );
};

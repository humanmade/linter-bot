const child_process = require( 'child_process' );
const fs = require( 'fs' );
const path = require( 'path' );

const PHPCS_PATH = path.join( __dirname, 'vendor', 'squizlabs', 'php_codesniffer', 'bin', 'phpcs' );
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

module.exports = codepath => {
	// Detect a ruleset file if we can, otherwise use default.
	return Promise.all( CONFIG_NAMES.map( filename => {
		return new Promise( resolve => {
			const filepath = path.join( codepath, filename );
			fs.access( filepath, err => {
				resolve( err ? null : filepath );
			} );
		} );
	} ) ).then( rulesetFiles => {
		const standard = rulesetFiles.find( file => !! file ) || DEFAULT_CONFIG;

		// const standard = 'PSR2'; //...
		const args = [
			PHPCS_PATH,
			'--runtime-set',
			'installed_paths',
			'vendor/wp-coding-standards/wpcs,vendor/fig-r/psr2r-sniffer',
			`--standard=${standard}`,
			'--report=json',
			codepath
		];
		const opts = {
			cwd: __dirname,
			env: process.env,
		};

		return new Promise( ( resolve, reject ) => {
			const proc = child_process.spawn( 'php', args, opts );
			let stdout = '';
			let stderr = '';
			proc.stdout.on( 'data', data => stdout += data );
			proc.stderr.on( 'data', data => stderr += data );
			proc.on( 'error', e => { console.log(e) } );
			proc.on( 'close', errCode => {
				// 0: no errors found
				// 1: errors found
				// 2: fixable errors found
				// 3: processing error
				if ( errCode > 2 ) {
					return reject( stderr || stdout );
				}

				let data;
				try {
					data = JSON.parse( stdout );
				} catch ( e ) {
					// Couldn't decode JSON, so likely a human readable error.
					console.log(e)
					return reject( stdout );
				}

				resolve( formatOutput( data, codepath ) );
			} );
		} );
	} );
};

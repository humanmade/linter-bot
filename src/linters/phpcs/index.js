const child_process = require( 'child_process' );
const fs = require( 'fs' );
const path = require( 'path' );

const CONFIG_NAMES = [
	'.phpcs.xml',
	'phpcs.xml',
	'.phpcs.xml.dist',
	'phpcs.xml.dist',
	'phpcs.ruleset.xml',
];

/**
 * Convert a phpcs error into formatOutput-style results.
 *
 * @param {Object} message Raw message data from PHPCS.
 * @returns {Object}
 */
const formatMessage = message => {
	const details = `<details><summary>Error details</summary><code>${message.source}</code> from phpcs</details>`;
	const text = `${message.message}`;

	return {
		line:     message.line,
		column:   message.column,
		severity: message.severity === 5 ? 'error' : 'warning',
		message:  text,
		source:   message.source,
	};
};

/**
 * Convert phpcs results into common output format.
 *
 * @param {Object} data     Warnings and errors from PHPCS.
 * @param {String} codepath Path to the code getting linted.
 * @returns {{files, totals: {warnings: *, errors: *}}}
 */
const formatOutput = ( data, codepath ) => {
	const totals = {
		errors: 0,
		warnings: 0,
	};
	const files = {};
	Object.keys( data.files ).forEach( file => {
		// Ensure the path has a leading slash.
		const fullPath = file.replace( /^([^\/])/,'/$1' );
		const relPath = path.relative( codepath, fullPath );
		const messages = data.files[ file ].messages.map( formatMessage );
		totals.errors = messages.reduce( ( count, message ) => {
			return message.severity === 'error' ? count + 1 : count;
		}, totals.errors );
		totals.warnings = messages.reduce( ( count, message ) => {
			return message.severity === 'warning' ? count + 1 : count;
		}, totals.warnings );
		files[ relPath ] = messages;
	} );

	return { totals, files };
};

/**
 * Run PHPCS linting.
 *
 * @param {String} standardPath Path to custom standard set.
 */
module.exports = standardPath => codepath => {
	const phpcsPath = path.join( standardPath, 'vendor', 'bin', 'phpcs' );

	// Detect a ruleset file if we can, otherwise use default.
	return Promise.all( CONFIG_NAMES.map( filename => {
		return new Promise( resolve => {
			const filepath = path.join( codepath, filename );
			fs.access( filepath, err => {
				resolve( err ? null : filepath );
			} );
		} );
	} ) ).then( rulesetFiles => {
		let standard;
		if ( process.env.FORCE_STANDARD_PHPCS ) {
			standard = process.env.FORCE_STANDARD_PHPCS;
		} else {
			standard = rulesetFiles.find( file => !! file ) || process.env.DEFAULT_STANDARD_PHPCS || 'vendor/humanmade/coding-standards';
		}

		const installedPaths = [
			'vendor/fig-r/psr2r-sniffer',
			'vendor/humanmade/coding-standards/HM',
			'vendor/humanmade/coding-standards/HM-Required',
			'vendor/phpcompatibility/php-compatibility',
			'vendor/phpcompatibility/phpcompatibility-paragonie',
			'vendor/phpcompatibility/phpcompatibility-wp',
			'vendor/wp-coding-standards/wpcs',
		]

		// Only include the VIP WPCS if the path exists within this version of the standards.
		if ( fs.existsSync( path.join( standardPath, 'vendor', 'automattic', 'vipwpcs' ) ) ) {
			installedPaths.push( 'vendor/automattic/vipwpcs' );
		}

		const args = [
			phpcsPath,
			'-q',
			'--runtime-set',
			'installed_paths',
			installedPaths.join( ',' ),
			`--standard=${standard}`,
			'--report=json',
			codepath
		];
		const opts = {
			cwd: standardPath,
			env: process.env,
		};

		return new Promise( ( resolve, reject ) => {
			console.log( 'Spawning PHP process', args, opts );
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
					console.log(stdout)
					console.log(e)
					return reject( stdout );
				}

				resolve( formatOutput( data, codepath ) );
			} );
		} );
	} );
};

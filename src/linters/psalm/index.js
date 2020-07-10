const child_process = require( 'child_process' );
const fs = require( 'fs' );
const path = require( 'path' );

const CONFIG_NAMES = [
	'psalm.xml',
];

/**
 * Convert a Psalm error into formatOutput-style results.
 *
 * @param {Object} message Issue data from Psalm.
 * @returns {Object}
 */
const formatMessage = message => {
	const text = `${message.message}`;

	return {
		line:     message.line_from,
		column:   0,
		severity: message.severity,
		message:  message.message,
		source:   message.type,
	};
};

/**
 * Convert Psalm results into common output format.
 *
 * @param {Array} data     Warnings and errors from Psalm.
 * @param {String} codepath Path to the code getting linted.
 * @returns {{files, totals: {warnings: *, errors: *}}}
 */
const formatOutput = ( data, codepath ) => {
	const totals = {
		errors: 0,
		warnings: 0,
	};
	const files = {};
	data.forEach( psalmIssue => {
		const relPath = path.relative( codepath, psalmIssue.file_path );
		if ( psalmIssue.severity === 'error' ) {
			totals.errors++;
		} else if ( psalmIssue.severity === 'warning' ) {
			totals.warnings++;
		}
		files[ relPath ] = formatMessage( psalmIssue )
	} );

	return { totals, files };
};

/**
 * Run Psalm typechecking.
 *
 * @param {String} standardPath Path to custom standard set.
 */
module.exports = standardPath => codepath => {
	const psalmPath = path.join( standardPath, 'vendor', 'bin', 'psalm' );

	const args = [
		psalmPath,
		'--output-format=json',
		'--no-progress',
	];
	const opts = {
		cwd: codepath,
		env: process.env,
	};

	return composerInstall( codepath ).then( () => {
		return new Promise( ( resolve, reject ) => {
			console.log( 'Spawning PHP process', psalmPath, args, opts );
			const proc = child_process.spawn( 'php', args, opts );
			let stdout = '';
			let stderr = '';
			proc.stdout.on( 'data', data => stdout += data );
			proc.stderr.on( 'data', data => stderr += data );
			proc.on( 'error', e => { console.log( e ) } );
			proc.on( 'close', errCode => {
				// Error codes:
				// 0: no errors found
				// 1: errors found or Psalm processing error
				let data;
				try {
					data = JSON.parse( stdout );
				} catch ( e ) {
					// Couldn't decode JSON, so likely a human readable error.
					console.log( stdout )
					console.log( stderr )
					console.log( e )
					return reject( stdout + stderr );
				}

				resolve( formatOutput( data, codepath ) );
			} );
		} );
	} );
};

function composerInstall( codepath ) {
	const opts = {
		cwd: codepath,
		env: process.env,
	};
	return new Promise( ( resolve, reject ) => {
		const proc = child_process.spawn( 'composer', [ 'install', '--no-dev' ], opts );
		let stdout = '';
		let stderr = '';
		proc.stdout.on( 'data', data => {
			stdout += data;
			console.log( data );
		} );
		proc.stderr.on( 'data', data => {
			stderr += data;
			console.error( String( data ) );
		 } );
		proc.on( 'error', e => { console.log( e ) } );
		proc.on( 'close', errCode => {
			if ( errCode > 0 ) {
				reject( stderr )
			}

			resolve( stdout );
		} );
	} );
}


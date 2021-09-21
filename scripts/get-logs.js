const child_process = require( 'child_process' );
const fs = require('graceful-fs');

const reqId = process.argv[2];
const HOUR_LIMIT = process.env.HOUR_LIMIT || 48;

const now = Math.floor( Date.now() / 1000 );
const start = now - ( 60 * 60 * HOUR_LIMIT );
const region = 'us-east-1';
const group = '/aws/lambda/hm-linter';
const query = `fields @message | sort @timestamp asc | filter @requestId = '${ reqId }'`;
const logDir = './logs';

process.stderr.write( `Querying for ${ reqId }\n` );
const proc = child_process.spawnSync(
	'aws',
	[
		'logs',
		'start-query',
		'--region',
		region,
		'--log-group-name',
		group,
		'--start-time',
		start,
		'--end-time',
		now,
		'--query-string',
		query,
	]
);

if ( proc.status !== 0 ) {
	console.log( '' + proc.output[2] );
	return process.exit( 1 );
}

const { queryId } = JSON.parse( proc.output[1] );

const dataRegex = /^.+?\t.+?\t(\{.+)/s;

process.stderr.write( 'Waiting for results…\n' );
setTimeout( function () {
	const logFile = fs.openSync( `${ logDir }/${ reqId }.log`, 'w' );
	const viewProc = child_process.spawnSync(
		'aws',
		[
			'logs',
			'get-query-results',
			'--region',
			region,
			'--query-id',
			queryId
		]
	);
	if ( viewProc.status !== 0 ) {
		console.log( '' + viewProc.output[2] );
		return process.exit( 1 );
	}

	const data = JSON.parse( viewProc.output[1] );

	let rawData = null;
	data.results.slice( 0, 3 ).forEach( row => {
		const message = row.find( f => f.field === '@message' ).value;

		if ( ! rawData ) {
			const hasMatch = message.match( dataRegex );
			if ( hasMatch ) {
				rawData = hasMatch[1];
			}
		}

		fs.writeSync( logFile, message );
	} );

	fs.closeSync( logFile );
	fs.writeFileSync( `${ logDir }/${ reqId }.json`, rawData );
	process.stderr.write( `Log saved to:\t\tlogs/${ reqId }.log\n` );
	process.stderr.write( `Raw data saved to:\tlogs/${ reqId }.json\n` );
}, 2000 );

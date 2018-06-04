const chalk = require( 'chalk' );

const util = require( './util' );

const client = util.createClient();

// Gather app metadata
async function getMetadata() {
	const response = await client.request( {
		url: '/app',
	} );
	return response.data;
}

// Gather all installations from the API
async function getInstalls() {
	const response = await client.request( {
		url: '/app/installations',
	} );
	const { data } = response;

	while ( client.hasNextPage( response ) ) {
		response = await client.getNextPage( response );
		data = data.concat( response.data )
	}

	return data;
}

const installPromise = getInstalls();

getMetadata().then( metadata => {
	console.log( `Data for ${ chalk.green.bold( metadata.name ) } (ID ${ metadata.id })\n` );

	installPromise
		.then( installs => {
			console.log( 'Installed on:' );
			installs.forEach( install => console.log( chalk.grey( '• ' ) + install.account.login ) );
		} )
		.catch( err => {
			console.log( 'Cannot fetch installs' );
			console.log( err );
		} );
} );

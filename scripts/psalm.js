const psalm = require( '../src/linters/psalm' );

const standardDir = process.argv[2];
const codedir = process.argv[3];

psalm( standardDir )( codedir )
	.then( results => {
		console.log( results );
	})
	.catch( err => {
		console.error( `error: ${err.message}` )
	})

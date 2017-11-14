const phpcs = require( '../linters/phpcs' );

const codedir = process.argv[2];

phpcs( codedir )
	.then( results => {
		console.log( results );
	})
	.catch( err => {
		console.error( `error: ${err.message}` )
	})

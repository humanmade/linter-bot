const hmLinter = require('./index');
const fs = require('fs')

const testEvent = JSON.parse( fs.readFileSync('./fixtures/lambda-test-event.json') )
hmLinter.probotHandler( testEvent, null, function( err, success ) {
	console.log( err )
	console.log( success )
} )

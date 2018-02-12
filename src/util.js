function combineLinters( results ) {
	return results
		.map( linter => linter.files )
		.reduce( ( allResults, linterResults ) => {
			Object.keys( linterResults ).forEach( file => {
				if ( allResults[ file ] ) {
					allResults[ file ].push( ...linterResults[ file ] );
				} else {
					allResults[ file ] = linterResults[ file ];
				}
			} );
			return allResults;
		}, {} );
}

module.exports = {
	combineLinters,
};

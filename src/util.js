const githubApi = require( 'github' );

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

const createGist = async ( description, filename, content ) => {
	const anonymousGithub = new githubApi();
	const response = await anonymousGithub.gists.create( {
		files: {
			[ filename ]: { content },
		},
		public: false,
		description,
	} );
	return response.data.html_url;
};

module.exports = {
	combineLinters,
	createGist,
};

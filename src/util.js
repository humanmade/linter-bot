const githubApi = require( 'github' );

const GIST_ACCESS_TOKEN = process.env.GIST_ACCESS_TOKEN || null;

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
	if ( ! GIST_ACCESS_TOKEN ) {
		console.warn( 'Missing GIST_ACCESS_TOKEN for Gist creation' );
		return null;
	}

	const anonymousGithub = new githubApi();
	anonymousGithub.authenticate( {
		type: 'token',
		token: GIST_ACCESS_TOKEN
	} );
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

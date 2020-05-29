const fs = require( 'fs' );
const path = require( 'path' );

const githubApi = require( '@octokit/rest' );

const GIST_ACCESS_TOKEN = process.env.GIST_ACCESS_TOKEN || null;

/**
 * Combine results-by-linter into a single results object.
 *
 * @param {Array} results Results from linting.
 * @returns {*}
 */
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

/**
 * Create a GitHub Gist (used for logging raw lint data).
 *
 * @param {String} description A descriptive name for this gist.
 * @param {String} filename    Filename for the gist.
 * @param {String} content     The content of the file.
 * @returns {Promise<*>}
 */
const createGist = async ( description, filename, content ) => {
	if ( ! GIST_ACCESS_TOKEN ) {
		console.warn( 'Missing GIST_ACCESS_TOKEN for Gist creation' );
		return null;
	}

	const gh = new githubApi();
	gh.authenticate( {
		type: 'token',
		token: GIST_ACCESS_TOKEN
	} );
	const response = await gh.gists.create( {
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

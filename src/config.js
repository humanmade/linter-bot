const yaml = require( 'js-yaml' );
const path = require( 'path' );

/**
 * Default configuration.
 *
 * @type {Object}
 */
const DEFAULT_CONFIG = {
	version: 'latest',
	phpcs: {
		enabled: true,
		version: 'inherit',
	},
	eslint: {
		enabled: true,
		version: 'inherit',
	},
	stylelint: {
		enabled: false,
		version: 'inherit',
	},
};

/**
 * Filename by which to find a custom configuration in a project.
 *
 * This can be customized by setting the CONFIG_FILE environment variable.
 *
 * @type {string}
 */
const FILENAME = process.env.CONFIG_FILE || 'hmlinter.yml';

/**
 * Reads the app configuration from the given YAML file in the `.github`
 * directory of the repository.
 *
 * @internal Ported from probot, but adapted to read from the current branch.
 *
 * @param context Context from Probot
 * @param head SHA of the head commit we're running against.
 * @return Configuration object read from the file
 */
module.exports = async ( context, head ) => {
	const params = {
		...context.repo( {
			path: path.posix.join( '.github', FILENAME ),
		} ),
		ref: head,
	};

	try {
		const res = await context.github.repos.getContent( params );
		const config = yaml.safeLoad( Buffer.from( res.data.content, 'base64' ).toString() ) || {};
		return {
			...DEFAULT_CONFIG,
			...config
		};
	} catch ( err ) {
		if ( err.code === 404 ) {
			return DEFAULT_CONFIG;
		} else {
			throw err;
		}
	}
};

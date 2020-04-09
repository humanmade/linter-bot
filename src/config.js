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
 * Merges a custom linter file (if any) with our default configuration.
 *
 * @param {Object} context
 * @returns {Promise<Object|*>}
 */
module.exports = async context => {
	return await context.config( FILENAME, DEFAULT_CONFIG );
};

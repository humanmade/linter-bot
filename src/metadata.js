/**
 * Regex pattern for evaluating HM Linter comments and pulling a JSON blob out.
 *
 * @type {RegExp}
 */
const regex = /\n\n<!-- hm-linter = (.*) -->/;

/**
 * Convert an HM Linter HTML comment into a JSON object.
 *
 * @param {String} text Original text.
 * @returns {Object}
 */
function parse( text ) {
	const match = text.replace( /\r\n/g, '\n' ).match( regex );
	if ( ! match ) {
		return null;
	}

	return JSON.parse( match[1] );
}

/**
 * Convert a JSON object into an HTML comment for HM Linter.
 *
 * @param {Object} data Data to convert.
 * @returns {string}
 */
function serialize( data ) {
	return `\n\n<!-- hm-linter = ${JSON.stringify(data)} -->`;
}

module.exports = {
	parse,
	serialize,
};

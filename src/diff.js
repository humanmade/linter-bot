const parseDiff = require( 'parse-diff' );

/**
 * Work out which files and lines are contained in this PR.
 *
 * @param {Object} pushConfig Data about the push being evaluated.
 * @param {Number} number     Run number.
 * @param {Object} github     GitHub API.
 * @returns {Promise<void>}
 */
module.exports.getDiffMapping = async ( pushConfig, number, github ) => {
	const diff = await github.pullRequests.get({
		owner: pushConfig.owner,
		repo: pushConfig.repo,
		number,

		headers: {
			Accept: 'application/vnd.github.v3.diff',
		}
	});

	// Form mapping.
	const mapping = {};
	const parsedFiles = parseDiff( diff.data );
	parsedFiles.forEach( file => {
		let position = 0;
		mapping[ file.to ] = {};
		file.chunks.forEach( (chunk, index) => {
			if (index !== 0) {
				position++;
			}
			chunk.changes.forEach( change => {
				position++;
				if( change.type === "add" ) {
					mapping[ file.to ][ change.ln || change.ln2 ] = position;
				}
			} );
		} );
	} );
	return mapping;
};

const parseDiff = require( 'parse-diff' );

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
				mapping[ file.to ][ change.ln || change.ln2 ] = position;
			} );
		} );
	} );
	return mapping;
};

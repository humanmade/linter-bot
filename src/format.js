const formatSummary = status => {
	const { passed, totals } = status;
	if ( passed ) {
		return 'All linters passed';
	}

	const summaryBits = [];
	if ( totals.errors ) {
		summaryBits.push( totals.errors === 1 ? '1 error' : `${ totals.errors } errors` );
	}
	if ( totals.warnings ) {
		summaryBits.push( totals.warnings === 1 ? '1 warning' : `${ totals.warnings } warnings` );
	}
	return summaryBits.join( ', ' );
};

const resultsByFile = results => {
	// Combine all messages.
	const files = {};
	results.forEach( result => {
		Object.keys( result.files ).forEach( file => {
			if ( ! files[ file ] ) {
				files[ file ] = {};
			}
			const comments = result.files[ file ];
			comments.forEach( comment => {
				if ( ! files[ file ][ comment.line ] ) {
					files[ file ][ comment.line ] = []
				}
				files[ file ][ comment.line ].push(
					comment.message
				);
			} );
		} );
	} );
	return files;
};

const formatReview = ( lintState, mapping ) => {
	// Convert to GitHub comments.
	const comments = [];
	let skipped = 0;

	const files = resultsByFile( lintState.results );
	Object.keys( files ).forEach( file => {
		Object.keys( files[ file ] ).forEach( line => {
			// Skip files which didn't change.
			if ( ! mapping[ file ] ) {
				skipped += files[ file ][ line ].length;
				return;
			}

			// Translate line to diff position.
			const position = mapping[ file ][ line ];
			if ( ! position ) {
				skipped += files[ file ][ line ].length;
				return;
			}

			const body = files[ file ][ line ].join( '\n\n----\n\n' );
			comments.push( {
				path: file,
				position,
				body,
			} );
		} );
	} );

	let body = `Linting failed (${ formatSummary( lintState ) }).`;
	let event = 'REQUEST_CHANGES';
	if ( skipped ) {
		const numText = skipped === 1 ? '1 notice' : `${skipped} notices`;

		if ( comments.length === 0 ) {
			// All errors already existing.
			event = 'COMMENT';
			body += `\n\n${numText} occurred in your codebase, but none on files/lines included in this PR.`;
		} else {
			body += `\n\n(${numText} occurred in your codebase, but were on files/lines not included in this PR.)`;
		}
	}

	return { body, comments, event };
};

module.exports = {
	formatReview,
	formatSummary,
	resultsByFile,
};

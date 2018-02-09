const _n = ( single, plural, count ) => count === 1 ? single : plural;

const formatSummary = status => {
	const { passed, totals } = status;
	if ( passed ) {
		return 'All linters passed';
	}

	const summaryBits = [];
	if ( totals.errors ) {
		summaryBits.push( `${ totals.errors } ${ _n( 'error', 'errors', totals.errors ) }` );
	}
	if ( totals.warnings ) {
		summaryBits.push( `${ totals.warnings } ${ _n( 'warning', 'warnings', totals.warnings ) }` );
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

const formatWelcome = ( state, gistUrl ) => {
	let body = `Hi there! Thanks for activating hm-linter on this repo.`
	body += `\n\nTo start you off, [here's an initial lint report of the repo](${ gistUrl }).`;
	body += ` I found ${ formatSummary( state ) } in your project.`;
	body += `\n\nFor more information about hm-linter, see [the project repo](https://github.com/humanmade/linter-bot).`
	body += ` If you need a hand with anything, ping @rmccue or @joehoyle who are always happy to help.`;
	body += `\n\n:heart: :robot:`;
	return body;
};

const formatDetails = state => {
	return JSON.stringify( state, null, 2 );
};

module.exports = {
	formatDetails,
	formatReview,
	formatSummary,
	formatWelcome,
	resultsByFile,
};

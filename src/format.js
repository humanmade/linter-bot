const metadata = require( './metadata' );
const { combineLinters } = require( './util' );

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

const formatComparison = comparison => {
	const { fixedErrors, fixedWarnings, newErrors, newWarnings } = comparison.totals;

	let errorStatus;
	if ( fixedErrors ) {
		errorStatus = `Fixed ${ fixedErrors } ${ _n( 'error', 'errors', fixedErrors ) }`;
		if ( newErrors ) {
			errorStatus += `, but introduced ${ newErrors } new ${ _n( 'error', 'errors', newErrors ) }`;
		}
	} else if ( newErrors ) {
		errorStatus = `Introduced ${ newErrors } new ${ _n( 'error', 'errors', newErrors ) }`;
	}

	let warningStatus;
	if ( fixedWarnings ) {
		warningStatus = `Fixed ${ fixedWarnings } ${ _n( 'warning', 'warnings', fixedWarnings ) }`;
		if ( newWarnings ) {
			warningStatus += `, but introduced ${ newWarnings } new ${ _n( 'warning', 'warnings', newWarnings ) }`;
		}
	} else if ( newWarnings ) {
		warningStatus = `Introduced ${ newWarnings } new ${ _n( 'warning', 'warnings', newWarnings ) }`;
	}

	const status = [ errorStatus, warningStatus ]
		.filter( status => !! status )
		.map( line => `* ${ line }` )
		.join( '\n' );

	return status;
}

const resultsByFile = combined => {
	// Combine all messages.
	const files = {};
	Object.keys( combined ).forEach( file => {
		if ( ! files[ file ] ) {
			files[ file ] = {};
		}
		const comments = combined[ file ];
		comments.forEach( comment => {
			if ( ! files[ file ][ comment.line ] ) {
				files[ file ][ comment.line ] = []
			}
			files[ file ][ comment.line ].push(
				comment.message
			);
		} );
	} );
	return files;
};

const formatComments = ( files, mapping ) => {
	// Convert to GitHub comments.
	const comments = [];
	let skipped = 0;

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

	return { comments, skipped };
}

const formatReview = ( lintState, mapping ) => {
	// Convert to GitHub comments.
	const allResults = combineLinters( lintState.results );
	const files = resultsByFile( allResults );
	const { comments, skipped } = formatComments( files, mapping );

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

	const withMetadata = body + metadata.serialize( lintState );

	return {
		// Don't allow the body to overflow.
		body: withMetadata.length < 65536 ? withMetadata : body,
		comments,
		event,
	};
};

const formatReviewChange = ( lintState, mapping, comparison ) => {
	// Don't change the previous review if nothing in the codebase has changed.
	if ( ! comparison.changed ) {
		return null;
	}

	if ( lintState.passed ) {
		const body = `Linting successful, all issues fixed! :tada:`;
		const withMetadata = body + metadata.serialize( lintState );
		return {
			// Don't allow the body to overflow.
			body: withMetadata.length < 65536 ? withMetadata : body,
			event: 'APPROVE',
		};
	}

	const formattedComparison = formatComparison( comparison );
	const body = ( lintState.passed ? `Linting successful.` : `Linting failed (${ formatSummary( lintState ) }).` )
		+ '\n\n' + formattedComparison;
	const withMetadata = body + metadata.serialize( lintState );

	const review = {
		// Don't allow the body to overflow.
		body: withMetadata.length < 65536 ? withMetadata : body,
		event: 'REQUEST_CHANGES',
	};

	return review;
}

const formatAnnotations = ( state, baseUrl ) => {
	const combined = combineLinters( state.results );

	const annotations = [];
	Object.keys( combined ).forEach( file => {
		const comments = combined[ file ];
		comments.forEach( comment => {
			const url = `${ baseUrl }/${ file }`;
			annotations.push( {
				path: file,
				start_line: comment.line,
				end_line: comment.line,
				message: comment.message,
				annotation_level: comment.severity === 'warning' ? 'warning' : 'failure',
				raw_details: JSON.stringify( comment, null, 2 ),
			} );
		} );
	} );

	return annotations;
};

/**
 * Format request metadata.
 *
 * Provides request details as part of the summary, allowing for easier tracing
 * and debugging.
 *
 * @param {Object} context Context object passed to hooks.
 * @return {String} HTML summary of request metadata.
 */
const formatMetadata = context => {
	const { metadata, reqContext } = context;

	if ( ! metadata ) {
		return '';
	}

	let body = '<details><summary>Request details</summary><ul>';
	body += `\n<li><strong>GitHub Event ID:</strong> <code>${ metadata.headers['X-GitHub-Delivery'] || 'UNKNOWN' }</code></li>`;
	body += `\n<li><strong>API Gateway ID:</strong> <code>${ metadata.requestContext.requestId }</code></li>`;
	body += `\n<li><strong>Lambda ID:</strong> <code>${ reqContext.awsRequestId }</code></li>`;
	body += `\n<li><strong>Log Stream:</strong> <code>${ reqContext.logStreamName }</code></li>`;
	body += '</ul></details>';
	return body;
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
	formatAnnotations,
	formatComparison,
	formatDetails,
	formatMetadata,
	formatReview,
	formatReviewChange,
	formatSummary,
	formatWelcome,
	resultsByFile,
};

const metadata = require( './metadata' );
const { combineLinters } = require( './util' );

/**
 * Retrieves the singular or plural form based on the supplied number.
 *
 * @param {String} single Singular form of the text.
 * @param {String} plural Plural form of the text.
 * @param {Number} count  Quantity to compare against.
 * @returns {String}
 */
const _n = ( single, plural, count ) => count === 1 ? single : plural;

/**
 * Format an overall summary string from test results.
 *
 * @param {Object} status Results of a linting run.
 * @returns {string} Concatenated summary string.
 */
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
	if ( totals.skipped ) {
		summaryBits.push( `${ totals.skipped } skipped`);
	}
	return summaryBits.join( ', ' );
};

/**
 * Format a string that compares previous and current check runs.
 *
 * @param {Object} comparison Comparison details.
 * @returns {string} Concatenated comparison results string.
 */
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
};

/**
 * Group linting results by filename.
 *
 * @param {Object} combined Object of all linting comments against a file set.
 * @returns {Object} Linting results broken out by filename.
 */
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

/**
 * Format an inline comment for inline reviews.
 *
 * @param {Object} files   Files linted and their linting results.
 * @param {Object} mapping Diff mapping of all files changes in a Pull Request.
 * @returns {Object} Code comments.
 */
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
};

/**
 * Format a review summary string.
 *
 * This text is used as the summary for a Pull Request review.
 *
 * @param {Object} lintState Results of a linting run.
 * @param {Array}  mapping   Diff mapping of all files changes in a Pull Request.
 * @returns {Object} Data about a review.
 */
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

/**
 * Format a review summary string for subsequent PR runs.
 *
 * This text is used when the Linter Bot is running for a second (or greater)
 * time on a Pull Request.
 *
 * @param {Object} lintState  Results of a linting run.
 * @param {Array}  mapping    Diff mapping of all files changes in a Pull Request.
 * @param {Object} comparison Comparison data.
 * @returns {Object} GH-ready review data.
 */
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
};

/**
 * Format annotation data to send to GitHub.
 *
 * @param {Object} state   Results of a linting run.
 * @param {String} baseUrl Base URL of the GitHub changeset.
 * @param {Array}  mapping    Diff mapping of all files changes in a Pull Request.
 * @returns {Array} Compiled annotations for sending to GH.
 */
const formatAnnotations = ( state, baseUrl, mapping ) => {
	const combined = combineLinters( state.results );
	state.totals.skipped = 0;
	const files = resultsByFile( combined );
	const annotations = [];
	Object.keys( combined ).forEach( file => {
		const comments = combined[ file ];
		comments.forEach( comment => {
			if ( process.env.CHECK_ANNOTATION_ONLY_RELATED ) {
				if ( ! mapping[ file ] ) {
					state.totals.skipped += files[ file ][ comment.line ].length;
					return;
				}
				if ( ! mapping[ file ][ comment.line ] ) {
					state.totals.skipped += files[ file ][ comment.line ].length;
					return;
				}
			}
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

/**
 * Format a welcome message for users who have just activated the bot on the repo.
 *
 * @todo:: fix this as it is broken atm.
 *
 * @param {Object} state   Results of a linting run.
 * @param {String} gistUrl URL of the gist where the cumulative initial results are stored.
 * @returns {string} Welcome data.
 */
const formatWelcome = ( state, gistUrl ) => {
	let body = `Hi there! Thanks for activating hm-linter on this repo.`;
	body += `\n\nTo start you off, [here's an initial lint report of the repo](${ gistUrl }).`;
	body += ` I found ${ formatSummary( state ) } in your project.`;
	body += `\n\nFor more information about hm-linter, see [the project repo](https://github.com/humanmade/linter-bot).`;
	body += ` If you need a hand with anything, ping @rmccue or @joehoyle who are always happy to help.`;
	body += `\n\n:heart: :robot:`;
	return body;
};

/**
 * Convert the whole results of a linting run into a JSON string for debugging.
 *
 * @param {Object} state Results of a linting run.
 * @returns {string}
 */
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

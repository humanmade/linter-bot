const metadata = require( './metadata' );
const { combineLinters } = require( './util' );

/**
 * Fetch all previous runs against a branch or repo.
 *
 * @param {Object} github GitHub API access.
 * @param {String} owner  Username of the code owner.
 * @param {String} repo   Name of the repository being linted.
 * @param {Number} number Run number.
 * @returns {Promise<*>}
 */
async function getAll( github, owner, repo, number ) {
	// Paginate and exhaust.
	let response = await github.pullRequests.getReviews( {
		owner,
		repo,
		number,
		per_page: 100,
	} )
	let reviews = response.data;

	while ( github.hasNextPage( response ) ) {
		response = await github.getNextPage( response )
		reviews = reviews.concat( response.data );
	}

	return reviews;
}

/**
 * Fetch data about a previous run against a branch or repo.
 *
 * @param {Object} github GitHub API access.
 * @param {String} owner  Username of the code owner.
 * @param {String} repo   Name of the repository being linted.
 * @param {Number} number Run number.
 * @returns {Promise<number>}
 */
async function getPreviousRun( github, owner, repo, number ) {
	const reviews = await getAll( github, owner, repo, number );

	return reviews
		.filter( review => review.user.type === 'Bot' && ( review.user.login === 'hm-linter' || review.user.login === 'hm-linter-development' ) )
		.reverse()
		.map( review => metadata.parse( review.body ) )
		.find( data => !! data );
}

/**
 * Generate a unique ID string for an error.
 *
 * @param {Object} error Data about a particular error.
 * @returns {string} Unique error ID.
 */
const errorId = error => `L${ error.line }C${ error.column || 0 }-${ error.source }`;

/**
 * Convert an array of errors into a more meaningful keyed object.
 *
 * @param {Array} list List of errors.
 * @returns {Object} An organized set of errors.
 */
const errorsById = list => list.reduce( ( errs, error ) => {
	return {
		...errs,
		[ errorId( error ) ]: error,
	}
}, {} );

/**
 * Compare two sets of error data to find differences between them.
 *
 * @param {Array} left  First error set.
 * @param {Array} right Second error set.
 * @returns {Object} Lists of errors unique to each set of runs.
 */
function diffErrors( left, right ) {
	const leftIds = errorsById( left );
	const rightIds = errorsById( right );

	return {
		onlyLeft: Object.keys( leftIds ).filter( id => ! rightIds[ id ] ).map( id => leftIds[ id ] ),
		onlyRight: Object.keys( rightIds ).filter( id => ! leftIds[ id ] ).map( id => rightIds[ id ] ),
	};
}

/**
 * Count the number of errors in an error list.
 *
 * @param {Array} errors List of errors.
 * @returns {Number} Quantity of errors.
 */
const countErrors = errors => errors.reduce( ( total, err ) => err.severity === 'error' ? total + 1 : total, 0 );

/**
 * Count the number of warnings in an error list.
 *
 * @param {Array} errors List of errors.
 * @returns {Number} Quantity of warnings.
 */
const countWarnings = errors => errors.reduce( ( total, err ) => err.severity === 'warning' ? total + 1 : total, 0 );

/**
 * Compare two Linter runs against each other.
 *
 * @param {Object} previous Previous linting data.
 * @param {Object} current  Current linting data.
 * @returns {Object} Organized data about the difference between two linter runs.
 */
function compareRuns( previous, current ) {
	const totals = {
		newErrors: 0,
		newWarnings: 0,
		fixedErrors: 0,
		fixedWarnings: 0,
	};

	const newIssues = {};
	const fixed = {};

	const allPrevious = combineLinters( previous.results );
	const allCurrent = combineLinters( current.results );

	// Process all files in the previous report...
	Object.keys( allPrevious ).forEach( file => {
		const prevFile = allPrevious[ file ];
		const currentFile = allCurrent[ file ];

		// If the file is not in the current report, the whole file was fixed.
		if ( ! currentFile ) {
			// Skip any files which never had any errors anyway.
			if ( ! prevFile.length ) {
				return;
			}

			fixed[ file ] = prevFile;

			// Calculate totals.
			totals.fixedErrors += countErrors( prevFile );
			totals.fixedWarnings += countWarnings( prevFile );
			return;
		}

		const { onlyLeft, onlyRight } = diffErrors( prevFile, currentFile );
		if ( onlyLeft.length > 0 ) {
			fixed[ file ] = onlyLeft;
			totals.fixedErrors += countErrors( onlyLeft );
			totals.fixedWarnings += countWarnings( onlyLeft );
		}

		if ( onlyRight.length > 0 ) {
			newIssues[ file ] = onlyRight;
			totals.newErrors += countErrors( onlyRight );
			totals.newWarnings += countWarnings( onlyRight );
		}
	} );
	Object.keys( allCurrent )
		.filter( file => ! allPrevious[ file ] )
		.forEach( file => {
			// If the file wasn't in the previous report, the whole file is errors.
			newIssues[ file ] = allCurrent[ file ];
			totals.newErrors += countErrors( allCurrent[ file ] );
			totals.newWarnings += countWarnings( allCurrent[ file ] );
		} );

	const changed = Object.keys( fixed ).length > 0 || Object.keys( newIssues ).length > 0;
	return {
		changed,
		totals,
		newIssues,
		fixed,
	};
}

module.exports = {
	compareRuns,
	getPreviousRun,
};

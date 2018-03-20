const metadata = require( './metadata' );
const { combineLinters } = require( './util' );

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

async function getPreviousRun( github, owner, repo, number ) {
	const reviews = await getAll( github, owner, repo, number );

	return reviews
		.filter( review => review.user.type === 'Bot' && ( review.user.login === 'hm-linter' || review.user.login === 'hm-linter-development' ) )
		.reverse()
		.map( review => metadata.parse( review.body ) )
		.find( data => !! data );
}

const errorId = error => `L${ error.line }C${ error.column || 0 }-${ error.source }`;
const errorsById = list => list.reduce( ( errs, error ) => {
	return {
		...errs,
		[ errorId( error ) ]: error,
	}
}, {} );
function diffErrors( left, right ) {
	const leftIds = errorsById( left );
	const rightIds = errorsById( right );

	return {
		onlyLeft: Object.keys( leftIds ).filter( id => ! rightIds[ id ] ).map( id => leftIds[ id ] ),
		onlyRight: Object.keys( rightIds ).filter( id => ! leftIds[ id ] ).map( id => rightIds[ id ] ),
	};
}

const countErrors = errors => errors.reduce( ( total, err ) => err.severity === 'error' ? total + 1 : total, 0 );
const countWarnings = errors => errors.reduce( ( total, err ) => err.severity === 'warning' ? total + 1 : total, 0 );

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

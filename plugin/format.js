module.exports.formatSummary = status => {
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

const regex = /\n\n<!-- hm-linter = (.*) -->/;

function parse( text ) {
	const match = text.replace( /\r\n/g, '\n' ).match( regex );
	if ( ! match ) {
		return null;
	}

	return JSON.parse( match[1] );
}

function serialize( data ) {
	return `\n\n<!-- hm-linter = ${JSON.stringify(data)} -->`;
}

module.exports = {
	parse,
	serialize,
};

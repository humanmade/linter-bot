const DEFAULT_CONFIG = {
	version: 'latest',
	php: {
		enabled: true,
		version: 'inherit',
	},
	js: {
		enabled: true,
		version: 'inherit',
	},
};
const FILENAME = 'hmlinter.yml';

module.exports = async context => {
	return await context.config( FILENAME, DEFAULT_CONFIG );
};

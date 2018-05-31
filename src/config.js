const DEFAULT_CONFIG = {
	version: 'latest',
	phpcs: {
		enabled: true,
		version: 'inherit',
	},
	eslint: {
		enabled: true,
		version: 'inherit',
	},
};
const FILENAME = 'hmlinter.yml';

module.exports = async context => {
	return await context.config( FILENAME, DEFAULT_CONFIG );
};

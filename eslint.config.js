// ESLint flat configuration, replacing the .eslintrc.js it reproduces rule for rule.

const js = require( '@eslint/js' );
const globals = require( 'globals' );

module.exports = [
	js.configs.recommended,
	{
		files: [ '**/*.js' ],
		languageOptions: {
			// 'latest' selects the globals of the newest ECMAScript edition as well as
			// its syntax, so no explicit es20xx set is needed here
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: {
				...globals.browser,
				...globals.worker,
				LaunchParams: 'readonly'
			}
		},
		rules: {
			'indent': [ 'error', 'tab' ],
			// the checkout is LF throughout: .gitattributes normalises line endings, and
			// the 'windows' setting of the old configuration failed every file on Linux
			'linebreak-style': [ 'error', 'unix' ],
			'quotes': [ 'error', 'single' ],
			'semi': [ 'error', 'always' ],
			'no-console': 'off',
			'no-trailing-spaces': 'error',
			'prefer-const': [ 'error', {
				'destructuring': 'any',
				'ignoreReadBeforeAssign': false
			} ]
		}
	}
];

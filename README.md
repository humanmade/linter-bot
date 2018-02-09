<table width="100%">
	<tr>
		<td align="left" width="70%">
			<strong>hm-linter bot</strong><br />
			Automatically run the HM Coding Standards on any repository.
		</td>
		<td align="center" width="30%">
			🤖
		</td>
	</tr>
	<tr>
		<td>
			A <strong><a href="https://hmn.md/">Human Made</a></strong> project. Maintained by @rmccue and @joehoyle.
		</td>
		<td align="center" width="30%">
			<img src="https://hmn.md/content/themes/hmnmd/assets/images/hm-logo.svg" width="100" />
		</td>
	</tr>
</table>

Automatically run the [HM Coding standards](https://github.com/humanmade/coding-standards) on any repository.

<img src="https://hmn.md/uploads/2018/02/Screenshot-2018-02-09-16.37.17.png" width="774" />


## Installation

To enable on any repository on GitHub, simply [head to the app page](https://github.com/apps/hm-linter) and Install/Configure. You'll get an initial report as a new issue if you have any existing linting errors in your codebase.

Every repository is different, and you might want to customise the rules that the linter runs. Good news: you can do just that. hm-linter detects custom configuration files automatically, just create a `phpcs.ruleset.xml` file for phpcs or [`eslintrc.*`](https://eslint.org/docs/user-guide/configuring#configuration-file-formats) file for ESLint.

See the [HM Coding standards](https://github.com/humanmade/coding-standards) documentation for how to configure specific rules.

**Note:** Custom configuration can only use rules/standards which hm-linter has available. This includes the HM Coding Standards as well as any dependencies of it (such as the WP Coding Standards).


## Development

hm-linter is a GitHub bot built on top of the [Probot framework](https://probot.github.io/). It runs on Lambda, which runs Node 6.10.

To get started on development of hm-linter:

1. Clone this repository
2. `npm install` or `yarn install` the dependencies
3. `cd src/linters/phpcs && composer install` to download the HM Coding Standards


### Testing

You'll want to use probot's simulation mode. This simulates a webhook request from GitHub, **but uses the live GitHub API**, so be careful. The fixture data included in the repo is from a test repository (rmccue/test-linter).

Note also that both a `.env` and private key are required. You can create your own GitHub App to get these, or ping me (@rmccue) to get the details for `hmlinter`.

Your private key should be saved as `private-key.pem`, and your `.env` should contain this:

```
APP_ID=5455
WEBHOOK_SECRET=development
```

To test a `push` webhook:

```
node_modules/.bin/probot simulate push fixtures/push.json ./plugin/linter.js
```

To test a `pull_request.open` webhook:

```
node_modules/.bin/probot simulate pull_request fixtures/pull_request.opened.json ./plugin/linter.js
```

To test a `pull_request.synchronize` webhook:

```
node_modules/.bin/probot simulate pull_request fixtures/pull_request.synchronize.json ./plugin/linter.js
```


### Deployment

hm-linter is deployed on a Lambda instance. Deployment is handled via npm scripts, which you run via `npm run <script>` or `yarn run <script>`.

To deploy hm-linter, you need the following things:

* [AWS CLI](https://aws.amazon.com/cli/)
* Docker - used to compile and test things in a Lambda-like environment
* `private-key.pem` - Ask @rmccue or @joehoyle for this file.

Deployment can be done in one step by running the `deploy` script, but you should generally test builds first. The following scripts will help with that:

* `build` - Builds JS, downloads PHP binary, and installs Composer/npm dependencies.
* `deploy:package` - Builds the directory into a zip. Use this to verify the ZIP before pushing.
* `deploy:push` - Push the built zip to Lambda. Use this if `deploy` fails due to some sort of network error.
* `test` - Run the index handler against a simulated Lambda environment. Before running this:
	* Run `build` at least once
	* Set the `AWS_LAMBDA_EVENT_BODY` environment variable to the contents of `fixtures/lambda-test-event.json` (`cat fixtures/lambda-test-event.json | read -z AWS_LAMBDA_EVENT_BODY`)

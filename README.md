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
			A <strong><a href="https://hmn.md/">Human Made</a></strong> project. Maintained by @rmccue.
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

Every repository is different, and you might want to customise the rules that the linter runs. Good news: you can do just that. hm-linter detects custom configuration files automatically, just create a `phpcs.ruleset.xml` file for phpcs, [`eslintrc.*`](https://eslint.org/docs/user-guide/configuring#configuration-file-formats) file for ESLint, or [`.stylelintrc`](https://stylelint.io/user-guide/configure) for stylelint.

See the [HM Coding standards](https://github.com/humanmade/coding-standards) documentation for how to configure specific rules.

**Note:** Custom configuration can only use rules/standards which hm-linter has available. This includes the HM Coding Standards as well as any dependencies of it (such as the WP Coding Standards).


## Configuration

By default, hmlinter will use the latest version of the Human Made coding standards. You can configure it to use an older or fixed version by creating a `.github/hmlinter.yml` file. This file should look like:

```yaml
# GLOBAL SETTINGS

# By default, the version is set to "latest". This can be set to any version
# from 0.4.2 and above, but you MUST include the full version number.
# If you wish to increase the security releases automatically set the 
# version to be 'X.Y', otherwise it will be 'X.Y.Z'.
version: latest

# PER-STANDARD SETTINGS
phpcs:
    # Set to false to disable phpcs
    enabled: true

    # Set to "inherit" to use the global version, "latest" for the latest
    # version, or a specific full version number.
    version: inherit

eslint:
    enabled: true
    version: inherit

stylelint:
    enabled: true
    version: inherit
```

Versions **MUST** be specified in full format (i.e. `0.5.0`). `latest` is available as a convenient shorthand for the latest published version, but note that this will be updated and may cause your code to fail future checks.


## Development

hm-linter is a GitHub bot built on top of the [Probot framework](https://probot.github.io/). It runs on Lambda, which runs Node 12.x.

To get started on development of hm-linter:

1. Clone this repository
2. `npm install` or `yarn install` the dependencies


## Testing

### Live Testing

The easiest and best way to test hm-linter is to run the bot in development mode. This will run the bot locally, and uses a proxy to forward all webhook events from GitHub.

`yarn start` will run a development copy of the linter bot inside a Lambda-like Docker container.

To set this up:

1. Download "hm-linter-development Private Key" from the team 1Password Documents.
2. Save this file into the linter-bot directory as `development.private-key.pem`
3. Download "hm-linter-development .env" from the team 1Password Documents.
4. Save this file into the linter-bot directory as `.env`
5. Run `yarn start`

The development mode is set up only on the [linter-bot-test](https://github.com/humanmade/linter-bot-test) repository. You can add it to other repositories on the `humanmade` organisation, but **please only do this temporarily**. You should remove any repositories you add as soon as you're finished testing.

Webhook events for the development bot are sent to Smee.io, which [logs all events](https://smee.io/rpFoxbfDjkw5Srji). If you visit this page, you can also replay events; you should use this while developing/testing rather than repeatedly opening new PRs.

A typical development process looks like this:

1. Generate the test event you want or find one that already exists
2. Write the first version of your code to handle it
3. `yarn start`
4. [Replay the event on Smee](https://smee.io/rpFoxbfDjkw5Srji)
5. Check that your code did what you expect
6. If your code worked, you're done 🙌
7. If your code didn't work, kill the bot
8. Repeat steps 2-7 until your code works.


### Replicating production issues

The first step to replicating production issues is to understand the request being sent to hm-linter. Note that when running against these events, you are **testing against the live GitHub API**, so be careful.

Access the CloudWatch Logs for hm-linter (ask the Cloud team for access) and find the request you received. If you have the AWS CLI installed, you can do this by running the `scripts/get-logs.js` command.

Each check status page lists the various request IDs. The **Lambda ID** is the ID you need for pulling down the relevant logs and data.

This will write the logs to `{id}.log`, and save the raw data to `{id}.json`.

```sh
# For request deadbeef-badd-ecaf-dead-beefbaddecaf:
node scripts/get-logs.js deadbeef-badd-ecaf-dead-beefbaddecaf

# By default, this will only check the last 48 hours; to override, set HOUR_LIMIT:
HOUR_LIMIT=192 node scripts/get-logs.js deadbeef-badd-ecaf-dead-beefbaddecaf
```

```
Querying for deadbeef-badd-ecaf-dead-beefbaddecaf
Waiting for results…
Log saved to:           deadbeef-badd-ecaf-dead-beefbaddecaf.log
Raw data saved to:      deadbeef-badd-ecaf-dead-beefbaddecaf.json
```

You can then run the handler against a simulated Lambda environment locally (using Docker):

```
# Run build at least once:
npm run build

# Run the handler.
npm run test < deadbeef-badd-ecaf-dead-beefbaddecaf.json
```

**Note:** The format of the JSON data passed to `test` **must** be in API Gateway format (i.e. from the get-logs script). If you get an `Cannot read property 'x-github-event' of undefined` error, you're passing a GitHub event instead (i.e. from Smee).


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


## Advanced Configuration

Deployment settings can be changed using environment variables. In addition to the app settings noted above, the following can also be set:

* `BOT_NAME` - Name of the bot (default `hmlinter`)
* `CONFIG_FILE` - Name of the configuration file (default `hmlinter.yml`)
* `STANDARD_URL` - URL for the standards directory (default `https://make.hmn.md/hmlinter/standards`)
* `ENABLED_LINTERS` - Comma-separated string of enabled linter types (default `eslint,phpcs`)
* `FORCE_STANDARD_PHPCS` - Standard to use for checking, overrides any user standard (default disabled)
* `DEFAULT_STANDARD_PHPCS` - Default standard to check against for phpcs (default `vendor/humanmade/coding-standards`)
* `DEFAULT_STANDARD_ESLINT` - Default standard to check against for ESLint (default `eslint-config-humanmade`)
* `LAMBDA_FUNCTION` - Lambda function name for the `deploy` command (default `hm-linter`)
* `LAMBDA_REGION` - Lambda function region for the `deploy` command (default `us-east-1`)
* `FORCE_NEUTRAL_STATUS` - Mark failed checks as "neutral", which shows the check but does not mark it as failed (default disabled)
* `CHECK_ANNOTATION_ONLY_RELATED` - Post annotation in check for change which are related to current change instead of all (default disabled)
* `TEMP_DIR` - Change default temp directory to custom if we want to use EFS. (default `/tmp`)

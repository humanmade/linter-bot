# hmlinter bot

Very early work on a GitHub bot for linting. Uses Probot for GitHub webhook interactions.

## Testing

### Live Testing

The easiest and best way to test hm-linter is to run the bot in development mode. This will run the bot locally, and uses a proxy to forward all webhook events from GitHub.

To set this up:

1. Download "hm-linter-development Private Key" from the team 1Password Documents.
2. Save this file into the linter-bot directory as `development.private-key.pem`
3. Run `yarn start`

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


### Simulation

This repo also includes fixtures for specific events, and you can use Probot's simulation mode to test these. This simulates a webhook request from GitHub, **but uses the live GitHub API**, so be careful. Generally, you should use live testing instead, as it's more powerful. The fixture data included in the repo is from a test repository (rmccue/test-linter).

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


## Deployment

Currently working on setting up for Lambda. See [README.old.md]() for the old repo readme from https://github.com/tcbyrd/probot-lambda which contains (outdated) instructions.

## Todo

* Update `index.js` for probot updates
* Break `linter.js` up into more manageable pieces
* Bundle PHP binary for running on Lambda
* Run on Lambda

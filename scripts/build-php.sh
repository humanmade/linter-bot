#!/bin/bash -e
#
# scripts/build-php.sh [--upload]
#
# Run again with S3_BIN=s3://altis-review/bin to publish for altis-review.

: "${S3_BIN:=s3://hm-linter/bin}"

ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$ROOT"

echo "Building static PHP 8.2 (linux/amd64) via static-php-cli..."
docker build --platform linux/amd64 -f Dockerfile.php --target export --output "type=local,dest=./bin" .

if [[ ! -f ./bin/php ]]; then
	echo "Build failed: ./bin/php not produced" >&2
	exit 1
fi
chmod +x ./bin/php

echo "Built ./bin/php:"
file ./bin/php || true

if [[ "$1" == "--upload" ]]; then
	echo "Uploading ./bin/php to ${S3_BIN}/php ..."
	aws s3 cp ./bin/php "${S3_BIN}/php"
	echo "Done. Redeploy the Lambda (npm run deploy) to pick up the new binary."
else
	echo "Skipping upload. Re-run with --upload to publish to ${S3_BIN}."
fi

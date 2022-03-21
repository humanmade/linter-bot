#!/bin/bash -e

if [[ -z $1 ]]; then
    echo "You must provide a valid PHP version, if running via npm use `npm run build:php -- <version>`"
    exit 1
fi

PHP_VERSION="$1"
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

docker build --build-arg "php_version=${PHP_VERSION}" -o bin - < "$SCRIPT_DIR/Dockerfile.build-php"

#!/bin/bash -e

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

cd $SCRIPT_DIR
cp ../package.json ./
cp ../package-lock.json ./
docker build --platform linux/amd64 --progress plain -f "Dockerfile.build-npm" -o ../ .
rm package*.json

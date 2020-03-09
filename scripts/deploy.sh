#!/bin/bash -e

if [[ -z "$LAMBDA_FUNCTION" ]]; then
	echo "LAMBDA_FUNCTION must be set in .env"
	exit 1
fi

: "${LAMBDA_REGION:=us-east-1}"

echo "Deploying to $LAMBDA_FUNCTION in $LAMBDA_REGION"
aws lambda update-function-code --function-name $LAMBDA_FUNCTION --region $LAMBDA_REGION --zip-file fileb://lambda-function.zip

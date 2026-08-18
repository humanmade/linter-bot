# Builds a fully-static PHP 8.2 CLI binary for the linter-bot Lambda.
#
# The binary is statically linked (no libc / no libcrypt.so needed), so it runs
# on any Lambda runtime OS — AL1, AL2, or AL2023 — regardless of the function's
# configured Node runtime. This replaces the undocumented pre-8.x binary in
# s3://hm-linter/bin.
#
# Build + extract with scripts/build-php.sh (do not run `docker build` directly
# unless you know how to pull the artifact out).
FROM --platform=linux/amd64 debian:bookworm AS build

# Extensions phpcs + the HM / WPCS / VIP sniffs rely on. Tokenizer + the XML
# family are mandatory for phpcs itself; mbstring/ctype/fileinfo are used by
# the sniffs and rulesets.
ARG PHP_VERSION=8.2
ARG EXTENSIONS=ctype,dom,fileinfo,filter,mbstring,phar,simplexml,tokenizer,xml,xmlreader,xmlwriter

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      curl git ca-certificates build-essential autoconf bison re2c \
      pkg-config libtool make xz-utils \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# static-php-cli standalone binary — the modern, reproducible way to compile a
# static PHP. Pinned to the linux x86_64 build to match the Lambda arch.
RUN curl -fsSL https://dl.static-php.dev/static-php-cli/spc-bin/nightly/spc-linux-x86_64 \
      -o /usr/local/bin/spc \
 && chmod +x /usr/local/bin/spc

RUN spc doctor --auto-fix
RUN spc download --with-php=${PHP_VERSION} --for-extensions="${EXTENSIONS}"
RUN spc build "${EXTENSIONS}" --build-cli

# static-php-cli emits the finished binary here.
RUN /build/buildroot/bin/php --version

# Minimal stage so scripts/build-php.sh can copy the binary out.
FROM scratch AS export
COPY --from=build /build/buildroot/bin/php /php

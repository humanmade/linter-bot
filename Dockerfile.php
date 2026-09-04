# Static linking removes the libcrypt.so dependency and makes the binary
# runtime-OS-independent (AL1/AL2/AL2023). Build via scripts/build-php.sh.
FROM --platform=linux/amd64 debian:bookworm AS build

ARG PHP_VERSION=8.2
ARG EXTENSIONS=ctype,dom,fileinfo,filter,mbstring,phar,simplexml,tokenizer,xml,xmlreader,xmlwriter

# Keep apt lists in place — `spc doctor --auto-fix` installs extra deps.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      curl git ca-certificates build-essential autoconf bison re2c \
      pkg-config libtool make xz-utils unzip cmake autopoint gettext

WORKDIR /build

RUN curl -fsSL https://dl.static-php.dev/static-php-cli/spc-bin/nightly/spc-linux-x86_64 \
      -o /usr/local/bin/spc \
 && chmod +x /usr/local/bin/spc

RUN spc doctor --auto-fix
RUN spc download --with-php=${PHP_VERSION} --for-extensions="${EXTENSIONS}"
RUN spc build "${EXTENSIONS}" --build-cli
RUN /build/buildroot/bin/php --version

FROM scratch AS export
COPY --from=build /build/buildroot/bin/php /php

#!/usr/bin/env bash
set -e

export LIBRARY_PATH='out/Release'

export LIBRARY_FILES=(
    libbrotli.a
    libcares.a
    libhistogram.a
    libicudata.a
    libicui18n.a
    libicuucx.a
    libllhttp.a
    libnghttp2.a
    libnghttp3.a
    libngtcp2.a
    libnode.a
    libopenssl.a
    libtorque_base.a
    libuv.a
    libuvwasi.a
    libv8_base_without_compiler.a
    libv8_compiler.a
    libv8_init.a
    libv8_initializers.a
    libv8_libbase.a
    libv8_libplatform.a
    libv8_snapshot.a
    libv8_zlib.a
    libzlib.a
)

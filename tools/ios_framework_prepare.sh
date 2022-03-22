#!/usr/bin/env bash
set -e
export HOST_ARCH="$(uname -m)"
export COMPILE_FOR_ARCHS=(
    arm64
    ${HOST_ARCH}
)

ROOT=${PWD}
SCRIPT_DIR="$(dirname ${BASH_SOURCE})"
cd "${SCRIPT_DIR}"
SCRIPT_DIR=${PWD}

# should be node's source root
cd ../

export LIBRARY_PATH='out/Release'

compile_for_arch() {
    local TARGET_ARCH=$1

    local TARGET_LIBRARY_PATH="tools/ios-framework/bin/${TARGET_ARCH}"

    export GYP_DEFINES="host_arch=${HOST_ARCH} host_os=mac target_arch=${TARGET_ARCH} target_os=ios"

    # Need to define -arch by ourself when we're cross compiling
    # refer to xcode_emulation.py
    export CC="$(command -v cc) -arch ${TARGET_ARCH}"
    export CXX="$(command -v c++) -arch ${TARGET_ARCH}"
    export CC_host="$(command -v cc) -arch ${HOST_ARCH}"
    export CXX_host="$(command -v c++) -arch ${HOST_ARCH}"

    if command -v sccache &> /dev/null; then
        export CC="sccache ${CC}"
        export CXX="sccache ${CXX}"
        export CC_host="sccache ${CC_host}"
        export CXX_host="sccache ${CXX_host}"
    fi

    #make clean

    ./configure \
        --dest-os=ios \
        --dest-cpu=${TARGET_ARCH} \
        --with-intl=full-icu \
        --cross-compiling \
        --enable-static \
        --openssl-no-asm \
        --v8-options=--jitless \
        --without-node-code-cache \
        --without-node-snapshot \
        --v8-disable-webassembly

    make -j$(getconf _NPROCESSORS_ONLN)
    mkdir -p ${TARGET_LIBRARY_PATH}

    cp ${LIBRARY_PATH}/* ${TARGET_LIBRARY_PATH}
}

lipo_for_archs() {
    local TARGET_LIBRARY_PATH="tools/ios-framework/bin"
    local ARGS="-create"
    for ARCH in "${COMPILE_FOR_ARCHS[@]}"; do
        ARGS="${ARGS} ${TARGET_LIBRARY_PATH}/${ARCH}/$1"
    done
    ARGS="${ARGS} -output ${TARGET_LIBRARY_PATH}/$1"
    lipo ${ARGS}
}

build_framework() {
    local ARCH=$1
    local SDKTYPE="iphoneos"
    if [ "${ARCH}" = "x86_64" ]; then
        SDKTYPE="iphonesimulator"
    fi
    echo "Building framework for ${ARCH}"

    NODELIB_PROJECT_PATH='tools/ios-framework'
    # workaround for lipo
    rm -rf tools/ios-framework/bin/*.a
    cp tools/ios-framework/bin/${ARCH}/*.a tools/ios-framework/bin/

    xcodebuild build -project $NODELIB_PROJECT_PATH/NodeMobile.xcodeproj -target "NodeMobile" -configuration Release -arch ${ARCH} -sdk ${SDKTYPE} SYMROOT=${FRAMEWORK_TARGET_DIR}
}

for COMPILE_FOR_ARCH in "${COMPILE_FOR_ARCHS[@]}"; do
    echo "Compiling for ${COMPILE_FOR_ARCH}..."
    compile_for_arch ${COMPILE_FOR_ARCH}
done

# Currently broken as libv8_base_without_compiler exceeds 2GB
# for LIB in "${LIBRARY_FILES[@]}"; do
#     lipo_for_archs ${LIB}
# done

rm -rf out_ios
mkdir -p out_ios
cd out_ios
FRAMEWORK_TARGET_DIR="${PWD}"
cd ../

# don't override xcodebuild's CC
unset CC CXX CC_host CXX_host

for COMPILE_FOR_ARCH in "${COMPILE_FOR_ARCHS[@]}"; do
    echo "Building Framework for ${COMPILE_FOR_ARCH}..."
    build_framework ${COMPILE_FOR_ARCH}
done


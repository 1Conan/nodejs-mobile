#!/usr/bin/env bash
set -e
export HOST_ARCH="$(uname -m)"
export COMPILE_FOR_ARCHS=(
    arm64
)

# if [ "${HOST_ARCH}" != "arm64" ]; then
#     COMPILE_FOR_ARCHS+=("${HOST_ARCH}")
# fi

export LIBRARY_FILES=(
    libada.a
    libbase64.a
    libbase64_neon64.a
    libbrotli.a
    libcares.a
    libhistogram.a
    libllhttp.a
    libnghttp2.a
    libnghttp3.a
    libngtcp2.a
    libsimdutf.a
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
    libzlib_inflate_chunk_simd.a
    libicudata.a
    libicui18n.a
    libicustubdata.a
    libicuucx.a
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
        --cross-compiling \
        --enable-static \
        --enable-lto \
        --without-etw \
        --without-dtrace \
        --without-npm \
        --without-corepack \
        --with-arm-float-abi=hard \
        --with-arm-fpu=neon \
        --with-intl=small-icu \
        --v8-enable-snapshot-compression

    make -j$(getconf _NPROCESSORS_ONLN)
    mkdir -p ${TARGET_LIBRARY_PATH}

    for LIB in "${LIBRARY_FILES[@]}"; do
        cp ${LIBRARY_PATH}/${LIB} ${TARGET_LIBRARY_PATH}
    done
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

# Create xcframework

vtool -show-build out_ios/Release-iphoneos/NodeMobile.framework/NodeMobile > /tmp/buildVersion
SDK_VERSION=$(grep sdk /tmp/buildVersion | awk '{print $2}')
MINOS_VERSION=$(grep minos /tmp/buildVersion | awk '{print $2}')
VISIONOS_SDK_VERSION=1.0
VISIONOS_MINOS_VERSION=1.0

# iOS Simulator
vtool \
  -set-build-version iossim ${MINOS_VERSION} ${SDK_VERSION} \
  -replace -output out_ios/NodeMobile \
  out_ios/Release-iphoneos/NodeMobile.framework/NodeMobile
mkdir -p out_ios/Release-iphonesimulator
cp -r out_ios/Release-iphoneos/NodeMobile.framework{,.dSYM} out_ios/Release-iphonesimulator
rm -rf out_ios/Release-iphonesimulator/NodeMobile.framework/NodeMobile
mv out_ios/NodeMobile out_ios/Release-iphonesimulator/NodeMobile.framework/NodeMobile

# VisionOS Simulator
vtool \
  -set-build-version xrossim ${VISIONOS_MINOS_VERSION} ${VISIONOS_SDK_VERSION} \
  -replace -output out_ios/NodeMobile \
  out_ios/Release-iphoneos/NodeMobile.framework/NodeMobile
mkdir -p out_ios/Release-visionsimulator
cp -r out_ios/Release-iphoneos/NodeMobile.framework{,.dSYM} out_ios/Release-visionsimulator
rm -rf out_ios/Release-visionsimulator/NodeMobile.framework/NodeMobile
mv out_ios/NodeMobile out_ios/Release-visionsimulator/NodeMobile.framework/NodeMobile

# VisionOS
vtool \
  -set-build-version xros ${VISIONOS_MINOS_VERSION} ${VISIONOS_SDK_VERSION} \
  -replace -output out_ios/NodeMobile \
  out_ios/Release-iphoneos/NodeMobile.framework/NodeMobile
mkdir -p out_ios/Release-visionos
cp -r out_ios/Release-iphoneos/NodeMobile.framework{,.dSYM} out_ios/Release-visionos
rm -rf out_ios/Release-visionos/NodeMobile.framework/NodeMobile
mv out_ios/NodeMobile out_ios/Release-visionos/NodeMobile.framework/NodeMobile

xcodebuild -create-xcframework \
  -framework out_ios/Release-iphoneos/NodeMobile.framework \
  -debug-symbols $(pwd)/out_ios/Release-iphoneos/NodeMobile.framework.dSYM \
  -framework out_ios/Release-iphonesimulator/NodeMobile.framework \
  -debug-symbols $(pwd)/out_ios/Release-iphonesimulator/NodeMobile.framework.dSYM \
  -framework out_ios/Release-visionos/NodeMobile.framework \
  -debug-symbols $(pwd)/out_ios/Release-visionos/NodeMobile.framework.dSYM \
  -framework out_ios/Release-visionsimulator/NodeMobile.framework \
  -debug-symbols $(pwd)/out_ios/Release-visionsimulator/NodeMobile.framework.dSYM \
  -output out_ios/NodeMobile.xcframework

pushd out_ios
  zip -r NodeMobile.xcframework.zip NodeMobile.xcframework
  sha256sum NodeMobile.xcframework.zip
popd

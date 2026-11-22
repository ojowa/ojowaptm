cmake_minimum_required(VERSION 3.28)
project(ojowaPTM-obs VERSION 1.0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# CPack configuration for MSI installer
set(CPACK_GENERATOR "WIX")
set(CPACK_PACKAGE_NAME "ojowaPTM OBS Microphone Plugin")
set(CPACK_PACKAGE_VENDOR "ojowa")
set(CPACK_PACKAGE_DESCRIPTION_SUMMARY "ojowaPTM OBS Microphone Plugin")
set(CPACK_PACKAGE_VERSION "${PROJECT_VERSION}")
set(CPACK_PACKAGE_INSTALL_DIRECTORY "obs-studio/plugins/ojowaptm-obs")
set(CPACK_WIX_UPGRADE_GUID "a1b2c3d4-e5f6-7890-abcd-ef1234567890")
set(CPACK_WIX_CULTURES "en-US")
set(CPACK_WIX_PRODUCT_NAME "ojowaPTM OBS Microphone Plugin ${PROJECT_VERSION}")

# OBS built from source: headers in obs-studio/libobs/, library in obs-install/bin/64bit/
set(OBS_INCLUDE_DIR "${CMAKE_SOURCE_DIR}/../obs-studio/libobs")
# Generated obsconfig.h (included by obs-config.h) is written to the OBS build tree
set(OBS_CONFIG_INCLUDE_DIR "${CMAKE_SOURCE_DIR}/../obs-studio/build/config")
# w32-pthreads headers (pthread.h) required by libobs/util/threading.h on Windows
set(OBS_W32_PTHREADS_INCLUDE_DIR "${CMAKE_SOURCE_DIR}/../obs-studio/deps/w32-pthreads")

# Find obs.lib using CMAKE_PREFIX_PATH (set to obs-install) plus explicit fallbacks
find_library(OBS_LIBRARY NAMES obs.lib
    PATHS "${CMAKE_SOURCE_DIR}/../obs-install/bin/64bit"
          "${CMAKE_SOURCE_DIR}/../obs-install/lib/64bit"
          "${CMAKE_SOURCE_DIR}/../obs-install/lib"
          "${CMAKE_SOURCE_DIR}/../obs-studio/build/libobs/Release"
          "${CMAKE_SOURCE_DIR}/../obs-studio/build/libobs/Debug"
)

if(NOT OBS_LIBRARY)
    message(FATAL_ERROR "obs.lib not found. Check OBS build/install paths.")
endif()

message(STATUS "Found OBS headers at ${OBS_INCLUDE_DIR}")
message(STATUS "Found OBS library at ${OBS_LIBRARY}")

include_directories("${CMAKE_SOURCE_DIR}/include" "${OBS_INCLUDE_DIR}" "${OBS_CONFIG_INCLUDE_DIR}" "${OBS_W32_PTHREADS_INCLUDE_DIR}")

add_library(ojowaPTM-obs MODULE
    src/ojowaPTM-audio-source.cpp
)

target_link_libraries(ojowaPTM-obs PRIVATE ${OBS_LIBRARY})

set_target_properties(ojowaPTM-obs PROPERTIES
    PREFIX ""
    WINDOWS_OUTPUT_DIRECTORY "bin/64bit"
)

# Configure CPack with WiX template
set(CPACK_WIX_TEMPLATE "${CMAKE_CURRENT_SOURCE_DIR}/ojowaptm-obs-plugin.wxs")
set(CPACK_WIX_PATCH_PATH "${CMAKE_CURRENT_SOURCE_DIR}")

include(CPack)
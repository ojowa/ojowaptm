cmake_minimum_required(VERSION 3.28)
project(ojowaPTM-obs VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# OBS built from source: headers in obs-studio/libobs/, library in obs-install/bin/64bit/
set(OBS_INCLUDE_DIR "${CMAKE_SOURCE_DIR}/../obs-studio/libobs")
# Generated obsconfig.h (included by obs-config.h) is written to the OBS build tree
set(OBS_CONFIG_INCLUDE_DIR "${CMAKE_SOURCE_DIR}/../obs-studio/build/config")

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

include_directories("${CMAKE_SOURCE_DIR}/include" "${OBS_INCLUDE_DIR}" "${OBS_CONFIG_INCLUDE_DIR}")

add_library(ojowaPTM-obs MODULE
    src/ojowaPTM-audio-source.cpp
)

target_link_libraries(ojowaPTM-obs PRIVATE ${OBS_LIBRARY})

set_target_properties(ojowaPTM-obs PROPERTIES
    PREFIX ""
    WINDOWS_OUTPUT_DIRECTORY "bin/64bit"
)
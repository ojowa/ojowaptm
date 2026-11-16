cmake_minimum_required(VERSION 3.10)
project(ojowaPTM-obs C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# OBS is built from source. Headers are in obs-studio/libobs/, libraries in obs-install/bin/64bit/
find_path(OBS_INCLUDE_DIR obs-module.h
    PATHS "${CMAKE_SOURCE_DIR}/../obs-studio/libobs"
    NO_DEFAULT_PATH
)

find_library(OBS_LIBRARY NAMES obs libobs
    PATHS "${CMAKE_SOURCE_DIR}/../obs-install/bin/64bit"
    NO_DEFAULT_PATH
)

if(NOT OBS_INCLUDE_DIR)
    message(FATAL_ERROR "OBS headers not found. Checked ${CMAKE_SOURCE_DIR}/../obs-studio/libobs")
endif()

if(NOT OBS_LIBRARY)
    message(FATAL_ERROR "OBS library not found. Checked ${CMAKE_SOURCE_DIR}/../obs-install/bin/64bit")
endif()

message(STATUS "Found OBS headers at ${OBS_INCLUDE_DIR}")
message(STATUS "Found OBS library at ${OBS_LIBRARY}")

include_directories(${OBS_INCLUDE_DIR})

add_library(ojowaPTM-obs MODULE
    src/ojowaPTM-audio-source.cpp
)

target_link_libraries(ojowaPTM-obs PRIVATE ${OBS_LIBRARY})

set_target_properties(ojowaPTM-obs PROPERTIES
    PREFIX ""
    WINDOWS_OUTPUT_DIRECTORY "bin/64bit"
)
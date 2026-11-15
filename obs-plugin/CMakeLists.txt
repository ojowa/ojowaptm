cmake_minimum_required(VERSION 3.10)
project(ojowaPTM-obs C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# OBS is built from source and installed to obs-install/ at workspace root
# Use find_path/find_library for robust discovery
find_path(OBS_INCLUDE_DIR obs-module.h
    PATHS "${CMAKE_SOURCE_DIR}/../obs-install"
    NO_DEFAULT_PATH
)

find_library(OBS_LIBRARY NAMES obs libobs
    PATHS "${CMAKE_SOURCE_DIR}/../obs-install"
    NO_DEFAULT_PATH
)

if(NOT OBS_INCLUDE_DIR)
    message(FATAL_ERROR "OBS headers not found. Checked ${CMAKE_SOURCE_DIR}/../obs-install/include")
endif()

if(NOT OBS_LIBRARY)
    message(FATAL_ERROR "OBS library not found. Checked ${CMAKE_SOURCE_DIR}/../obs-install")
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
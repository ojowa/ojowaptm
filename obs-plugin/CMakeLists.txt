cmake_minimum_required(VERSION 3.10)
project(ojowaPTM-obs C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# OBS is built from source and installed to CMAKE_PREFIX_PATH (obs-install/)
# Use find_package with PATHS to locate the local install
find_package(OBS REQUIRED PATHS "${CMAKE_PREFIX_PATH}" NO_DEFAULT_PATH)

include_directories(${OBS_INCLUDE_DIRS})

add_library(ojowaPTM-obs MODULE
    src/ojowaPTM-audio-source.cpp
)

target_link_libraries(ojowaPTM-obs PRIVATE ${OBS_LIBRARIES})

set_target_properties(ojowaPTM-obs PROPERTIES
    PREFIX ""
    WINDOWS_OUTPUT_DIRECTORY "bin/64bit"
)
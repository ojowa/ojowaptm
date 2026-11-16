cmake_minimum_required(VERSION 3.10)
project(ojowaPTM-obs C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# OBS is built from source. Headers are in obs-studio/libobs/, libraries in obs-install/bin/64bit/
set(OBS_INCLUDE_DIR "${CMAKE_SOURCE_DIR}/../obs-studio/libobs")
set(OBS_LIBRARY "${CMAKE_SOURCE_DIR}/../obs-install/bin/64bit/obs.lib")

if(NOT EXISTS "${OBS_INCLUDE_DIR}/obs-module.h")
    message(FATAL_ERROR "OBS headers not found at ${OBS_INCLUDE_DIR}")
endif()

if(NOT EXISTS "${OBS_LIBRARY}")
    message(FATAL_ERROR "OBS library not found at ${OBS_LIBRARY}")
endif()

message(STATUS "Found OBS headers at ${OBS_INCLUDE_DIR}")
message(STATUS "Found OBS library at ${OBS_LIBRARY}")

include_directories(${OBS_INCLUDE_DIR} "${CMAKE_SOURCE_DIR}/include" "${CMAKE_SOURCE_DIR}/../obs-studio/deps/w32-pthreads")

add_library(ojowaPTM-obs MODULE
    src/ojowaPTM-audio-source.cpp
)

target_link_libraries(ojowaPTM-obs PRIVATE ${OBS_LIBRARY})

set_target_properties(ojowaPTM-obs PROPERTIES
    PREFIX ""
    WINDOWS_OUTPUT_DIRECTORY "bin/64bit"
)
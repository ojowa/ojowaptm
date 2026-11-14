cmake_minimum_required(VERSION 3.10)
project(ojowaPTM-obs C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# OBS is built from source and installed to CMAKE_PREFIX_PATH (obs-install/)
# Manually set include dirs and library paths instead of find_package(OBS)
# which requires a generated OBSConfig.cmake that source builds don't produce.
set(OBS_INCLUDE_DIR "${CMAKE_PREFIX_PATH}/include")
set(OBS_LIB_DIR "${CMAKE_PREFIX_PATH}/lib")

if(EXISTS "${OBS_INCLUDE_DIR}/obs-module.h")
    message(STATUS "Found OBS headers at ${OBS_INCLUDE_DIR}")
else()
    message(FATAL_ERROR "OBS headers not found at ${OBS_INCLUDE_DIR}")
endif()

if(EXISTS "${OBS_LIB_DIR}/obs.lib")
    set(OBS_LIBRARIES "${OBS_LIB_DIR}/obs.lib")
    message(STATUS "Found OBS library at ${OBS_LIB_DIR}/obs.lib")
elseif(EXISTS "${OBS_LIB_DIR}/libobs.lib")
    set(OBS_LIBRARIES "${OBS_LIB_DIR}/libobs.lib")
    message(STATUS "Found OBS library at ${OBS_LIB_DIR}/libobs.lib")
else()
    message(FATAL_ERROR "OBS library not found in ${OBS_LIB_DIR}")
endif()

include_directories(${OBS_INCLUDE_DIR})

add_library(ojowaPTM-obs MODULE
    src/ojowaPTM-audio-source.cpp
)

target_link_libraries(ojowaPTM-obs PRIVATE ${OBS_LIBRARIES})

set_target_properties(ojowaPTM-obs PROPERTIES
    PREFIX ""
    WINDOWS_OUTPUT_DIRECTORY "bin/64bit"
)
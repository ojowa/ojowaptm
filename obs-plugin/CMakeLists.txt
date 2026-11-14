cmake_minimum_required(VERSION 3.10)
project(ojowaPTM-obs C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# OBS is built from source and installed to CMAKE_PREFIX_PATH (obs-install/)
# On Windows, libraries are at obs-install/bin/64bit/, headers at obs-install/include/
set(OBS_INCLUDE_DIR "${CMAKE_PREFIX_PATH}/include")

# Search multiple possible library locations for Windows
set(OBS_LIB_SEARCH_PATHS
    "${CMAKE_PREFIX_PATH}/lib"
    "${CMAKE_PREFIX_PATH}/lib/64bit"
    "${CMAKE_PREFIX_PATH}/bin/64bit"
)

set(OBS_LIBRARY_FOUND FALSE)
foreach(search_path ${OBS_LIB_SEARCH_PATHS})
    if(EXISTS "${search_path}/obs.lib")
        set(OBS_LIBRARIES "${search_path}/obs.lib")
        set(OBS_LIBRARY_FOUND TRUE)
        message(STATUS "Found OBS library at ${search_path}/obs.lib")
        break()
    elseif(EXISTS "${search_path}/libobs.lib")
        set(OBS_LIBRARIES "${search_path}/libobs.lib")
        set(OBS_LIBRARY_FOUND TRUE)
        message(STATUS "Found OBS library at ${search_path}/libobs.lib")
        break()
    endif()
endforeach()

if(NOT OBS_LIBRARY_FOUND)
    message(FATAL_ERROR "OBS library not found in any of: ${OBS_LIB_SEARCH_PATHS}")
endif()

if(EXISTS "${OBS_INCLUDE_DIR}/obs-module.h")
    message(STATUS "Found OBS headers at ${OBS_INCLUDE_DIR}")
else()
    message(FATAL_ERROR "OBS headers not found at ${OBS_INCLUDE_DIR}")
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
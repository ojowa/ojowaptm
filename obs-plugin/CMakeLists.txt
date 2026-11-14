cmake_minimum_required(VERSION 3.10)
project(ojowaPTM-obs C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(OBS REQUIRED)

include_directories(${OBS_INCLUDE_DIRS})

add_library(ojowaPTM-obs MODULE
    src/ojowaPTM-audio-source.cpp
)

target_link_libraries(ojowaPTM-obs PRIVATE ${OBS_LIBRARIES})

set_target_properties(ojowaPTM-obs PROPERTIES
    PREFIX ""
    SUFFIX ".so"
)
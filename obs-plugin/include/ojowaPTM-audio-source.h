#pragma once

#include <obs-module.h>
#include <obs.h>

#ifdef __cplusplus
extern "C" {
#endif

OBS_MODULE_API const char *obs_module_name(void);
OBS_MODULE_API bool obs_module_load(void);
OBS_MODULE_API void obs_module_unload(void);

#ifdef __cplusplus
}
#endif
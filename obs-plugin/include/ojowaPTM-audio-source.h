#pragma once

#if defined(_WIN32)
# define OBS_MODULE_API __declspec(dllexport)
# include <obs.h>
#else
# include <obs-module.h>
# include <obs.h>
#endif

#ifdef __cplusplus
extern "C" {
#endif

OBS_MODULE_API const char *obs_module_name(void);
OBS_MODULE_API bool obs_module_load(void);
OBS_MODULE_API void obs_module_unload(void);

#ifdef __cplusplus
}
#endif
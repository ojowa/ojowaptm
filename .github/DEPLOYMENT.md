# ojowaPTM OBS Plugin — Deployment Guide

This document describes how to build, package, and deploy the ojowaPTM OBS
Microphone plugin MSI installer.

## Overview

The deployment pipeline is git tag-driven:

1. **Develop** on `main` branch
2. **Tag a release** (e.g. `git tag v1.0.1 && git push origin v1.0.1`)
3. **GitHub Actions** builds the MSI on Windows and creates a GitHub Release
4. **Users** download the MSI from the GitHub Release page

Alternatively, use **workflow_dispatch** to manually trigger a deployment with a
specific tag name.

## CI/CD Workflow

File: `.github/workflows/obs-plugin-ci.yml`

### Jobs

| Job | Runs on | Trigger | Description |
|-----|---------|---------|-------------|
| `build-windows` | `windows-2022` | push / PR / dispatch | Builds the plugin DLL and packages the MSI |
| `deploy-release` | `ubuntu-latest` | tag push / dispatch | Creates a GitHub Release with the MSI artifact |

### Triggers

- **Push to `main`**: Builds the MSI and uploads it as a CI artifact (no release)
- **Push a tag** (`refs/tags/v*`): Builds + deploys a GitHub Release
- **workflow_dispatch**: Manual trigger with optional `tag_name` input

## Local Development

### Prerequisites

Install these on your Windows machine:

- [CMake](https://cmake.org/download/) (3.28+)
- [WiX Toolset v7](https://wixtoolset.org/releases/) (`wix.exe`)
- MSVC x64 toolchain (Visual Studio 2022 BuildTools)
- git

### Build the Plugin DLL Only

```powershell
powershell -ExecutionPolicy Bypass -File tools\deploy.ps1 -BuildOnly
```

### Build + Package MSI

```powershell
powershell -ExecutionPolicy Bypass -File tools\deploy.ps1
```

Produces: `obs-plugin/build/ojowaptm-obs-plugin-setup.msi`

### Build + Install MSI to OBS

```powershell
powershell -ExecutionPolicy Bypass -File tools\deploy.ps1 -Install
```

This silently installs the MSI (`/qn /norestart`) so the plugin is available in
OBS Studio immediately.

### Custom OBS Version

```powershell
powershell -ExecutionPolicy Bypass -File tools\deploy.ps1 -ObsVersion 30.2.2
```

## Git Tag Deployment (Recommended)

### Create and Push a Release Tag

```powershell
# On the main branch, with all changes committed:
git tag v1.0.1
git push origin v1.0.1
```

This triggers the `deploy-release` job which:

1. Downloads the MSI artifact from the build job
2. Creates (or updates) a GitHub Release at `https://github.com/ojowa/ojowaptm/releases/tag/v1.0.1`
3. Attaches `ojowaptm-obs-plugin-setup.msi` to the release

### Manual Deployment via GitHub Actions UI

1. Go to the **Actions** tab in the GitHub repository
2. Select **"OBS Plugin Build & Deploy"**
3. Click **Run workflow**
4. Enter the version tag (e.g. `v1.0.1`)
5. Click **Run workflow**

## Release Artifacts

Each release includes:

| Artifact | Description |
|----------|-------------|
| `ojowaptm-obs-plugin-setup.msi` | Windows MSI installer for the OBS plugin |

## Rollback

To rollback a release:

1. Go to the GitHub Releases page
2. Edit the release you want to replace
3. Upload the previous MSI file
4. Or delete the bad release and re-publish the previous tag

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `wix.exe` not found | Install WiX Toolset v7 from https://wixtoolset.org/releases/ |
| `cmake` not found | Install CMake and add to PATH |
| `obs.lib not found` | Build OBS Studio 33.0.1 first, or ensure `obs-install/` prefix exists |
| MSI install fails (exit 1603) | OBS Studio may not be installed; install OBS first |
| Release not created | Ensure you pushed a tag matching `v*` (e.g. `v1.0.1`) |

## Related Files

| File | Purpose |
|------|---------|
| `.github/workflows/obs-plugin-ci.yml` | GitHub Actions CI/CD pipeline |
| `tools/deploy.ps1` | Local build + deploy script |
| `obs-plugin/CMakePresets.json` | CMake build preset (`windows-x64`) |
| `obs-plugin/ojowaptm-obs-plugin.wxs` | WiX MSI source |
| `obs-plugin/CMakeLists.txt` | CMake build configuration |

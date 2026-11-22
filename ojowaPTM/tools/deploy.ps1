# ==============================================================================
# deploy.ps1  —  ojowaPTM OBS Plugin: local build + MSI deployment
#
# Builds the ojowaPTM OBS plugin and installs/packages the MSI installer.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File tools\deploy.ps1 -Install
#   powershell -ExecutionPolicy Bypass -File tools\deploy.ps1 -BuildOnly
#   powershell -ExecutionPolicy Bypass -File tools\deploy.ps1
#
# Parameters:
#   -Install       After building, install the MSI silently
#   -BuildOnly     Skip MSI packaging (build DLL only)
#   -ObsVersion    OBS Studio version (default: 33.0.1)
#   -MsiName       Output MSI filename
# ==============================================================================
[CmdletBinding()]
param(
    [switch]$Install,
    [switch]$BuildOnly,
    [string]$ObsVersion = "33.0.1",
    [string]$MsiName = "ojowaptm-obs-plugin-setup.msi"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot   = Resolve-Path "$PSScriptRoot\.."
$PluginDir  = Join-Path $RepoRoot "obs-plugin"
$PluginBuild= Join-Path $PluginDir "build"
$ObsInstall = Join-Path $RepoRoot "obs-install"
$MsiOut     = Join-Path $PluginBuild $MsiName

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  ojowaPTM OBS Plugin — Deploy" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "RepoRoot : $RepoRoot"
Write-Host "OBS Ver  : $ObsVersion"
Write-Host "Install  : $Install"
Write-Host "BuildOnly: $BuildOnly"
Write-Host ""

function Test-Cmd($name, $path) {
    if (-not (Test-Path $path)) { Write-Warning "MISSING $name: $path" }
    else { Write-Host "OK   $name -> $path" }
}

$cmake = Get-Command cmake -ErrorAction SilentlyContinue
if (-not $cmake) { throw "cmake is required but not on PATH" }
Write-Host "OK   cmake -> $($cmake.Source)"

$wix = Get-Command wix.exe -ErrorAction SilentlyContinue
if (-not $wix) {
    $wixPath = "C:\Program Files\WiX Toolset v7.0\bin\wix.exe"
    if (-not (Test-Path $wixPath)) { throw "WiX Toolset v7 (wix.exe) is required" }
    $env:PATH += ";" + (Split-Path $wixPath -Parent)
}
else { Write-Host "OK   wix.exe -> $($wix.Source)" }

Write-Host ""

Write-Host "[1/3] Configuring plugin ..." -ForegroundColor Yellow
$prefixArg = "-DCMAKE_PREFIX_PATH=$ObsInstall"
if (-not (Test-Path $ObsInstall)) {
    Write-Warning "obs-install prefix not found at $ObsInstall"
    Write-Warning "Plugin configure will fail unless OBS headers/lib are available elsewhere"
}
& cmake --preset windows-x64 -S $PluginDir -B $PluginBuild $prefixArg 2>&1 | Select-Object -Last 10
if ($LASTEXITCODE -ne 0) { throw "Plugin configure failed" }

Write-Host "[1/3] Building plugin ..." -ForegroundColor Yellow
& cmake --build --preset windows-x64 --target ojowaptm-obs --config Release 2>&1 | Select-Object -Last 10
if ($LASTEXITCODE -ne 0) { throw "Plugin build failed" }

$pluginDll = Join-Path $PluginBuild "Release\ojowaPTM-obs.dll"
if (-not (Test-Path $pluginDll)) {
    $pluginDll = Get-ChildItem -Path $PluginBuild -Filter "ojowaptm-obs.dll" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $pluginDll) { throw "ojowaptm-obs.dll not produced" }
    $pluginDll = $pluginDll.FullName
}
Write-Host "      built $pluginDll" -ForegroundColor Green

if ($BuildOnly) {
    Write-Host "`nBuild-only mode: skipping MSI packaging" -ForegroundColor Yellow
    Write-Host "=========================================================" -ForegroundColor Green
    Write-Host "  BUILD COMPLETE (DLL only)" -ForegroundColor Green
    Write-Host "  DLL : $pluginDll" -ForegroundColor Green
    Write-Host "=========================================================" -ForegroundColor Green
    exit 0
}

Write-Host "[2/3] Packaging MSI ..." -ForegroundColor Yellow
$wixBin = "$env:ProgramFiles\WiX Toolset v7.0\bin"
$pluginTargetDir = Join-Path (Split-Path $pluginDll) ""
& (Join-Path $wixBin "wix.exe") build `
    "obs-plugin/ojowaptm-obs-plugin.wxs" `
    "-dPluginTargetDir=$pluginTargetDir" `
    -out $MsiOut 2>&1 | Select-Object -Last 8
if ($LASTEXITCODE -ne 0) { throw "wix.exe build failed" }

if (-not (Test-Path $MsiOut)) { throw "MSI was not produced at $MsiOut" }
Write-Host "      MSI: $MsiOut" -ForegroundColor Green

if ($Install) {
    Write-Host "[3/3] Installing MSI ..." -ForegroundColor Yellow
    Write-Host "Running: msiexec /i `"$MsiOut`" /qn /norestart"
    & msiexec.exe /i "$MsiOut" /qn /norestart 2>&1
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 3010) {
        throw "MSI install failed (exit $LASTEXITCODE)"
    }
    Write-Host "      MSI installed successfully" -ForegroundColor Green
} else {
    Write-Host "[3/3] Skipping install (use -Install to install)" -ForegroundColor Yellow
}

Write-Host "=========================================================" -ForegroundColor Green
Write-Host "  DEPLOY COMPLETE" -ForegroundColor Green
Write-Host "  MSI : $MsiOut" -ForegroundColor Green
Write-Host "  DLL : $pluginDll" -ForegroundColor Green
if ($Install) { Write-Host "  INSTALLED to OBS" -ForegroundColor Green }
Write-Host "=========================================================" -ForegroundColor Green

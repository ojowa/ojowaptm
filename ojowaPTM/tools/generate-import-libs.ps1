# Generate MSVC import libraries (.lib) from obs-deps DLLs using dumpbin + lib.exe.
# Usage: powershell -ExecutionPolicy Bypass -File tools/generate-import-libs.ps1 -DepsRoot <path-to-obs-deps-extracted> -OutDir <lib-output-dir>
param(
    [string]$DepsRoot = (Resolve-Path "obs-deps/extracted"),
    [string]$OutDir   = (Resolve-Path "ci-libs/obs-deps-lib"),
    [string]$VcBin    = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $DepsRoot)) { throw "DepsRoot not found: $DepsRoot" }
if (-not (Test-Path "$VcBin/dumpbin.exe")) { throw "dumpbin.exe not found: $VcBin/dumpbin.exe" }
if (-not (Test-Path "$VcBin/lib.exe"))   { throw "lib.exe not found: $VcBin/lib.exe" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$binDir = Join-Path $DepsRoot "bin"
$dlls = Get-ChildItem -Path $binDir -Filter "*.dll" -File -ErrorAction SilentlyContinue | Sort-Object Name
$written = @()
$failed = @()

foreach ($dll in $dlls) {
    $name = [System.IO.Path]::GetFileNameWithoutExtension($dll.Name)
    $defFile = Join-Path $OutDir "$name.def"
    $libFile = Join-Path $OutDir "$name.lib"

    # Skip if import lib already exists and is newer than the dll
    if (Test-Path $libFile) { continue }

    try {
        $exports = & "$VcBin/dumpbin.exe" /exports $dll.FullName 2>&1 |
            Where-Object { $_ -match '^\s+\d+\s+\d+\s+[0-9A-Fa-f]+\s+\S+$' } |
            ForEach-Object { ($_.Trim() -split '\s+')[-1] } |
            Where-Object { $_ -ne '' }

        if ($exports.Count -eq 0) {
            Write-Warning "No exports found for $($dll.Name); skipping"
            $failed += $dll.Name
            continue
        }

        $lines = @("LIBRARY $name", "EXPORTS")
        foreach ($e in $exports) { $lines += "    $e" }
        $lines | Set-Content -Path $defFile -Encoding ascii

        & "$VcBin/lib.exe" /nologo /def:$defFile /machine:x64 /out:$libFile 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $libFile)) {
            Write-Warning "lib.exe failed for $($dll.Name)"
            $failed += $dll.Name
            continue
        }
        $written += $name
        Write-Host "OK  $name.lib ($($exports.Count) exports)"
    } catch {
        Write-Warning "Exception for $($dll.Name): $($_.Exception.Message)"
        $failed += $dll.Name
    }
}

Write-Host "`n=== Summary ==="
Write-Host "Generated: $($written.Count) import libraries"
if ($failed.Count) { Write-Host "Failed: $($failed.Count) -> $($failed -join ', ')" }

# MeowPrinter — Android APK build script (PowerShell)
# Prerequisites: Docker Desktop running
#
# Usage:
#   .\build-android.ps1          # Build debug APK
#   .\build-android.ps1 release  # Build release APK
#
# The APK will be in: .\bin\*.apk

param([string]$Mode = "debug")

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== MeowPrinter Android Build ===" -ForegroundColor Cyan
Write-Host ""

# 1. Ensure frontend is built
Write-Host "[1/4] Building frontend..." -ForegroundColor Yellow
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
Push-Location frontend
npm install --silent 2>$null
npx vite build 2>$null
Pop-Location
Write-Host "  Frontend built." -ForegroundColor Green

# 2. Copy frontend dist into a www/ folder at project root (p4a expects it there)
Write-Host "[2/4] Preparing www/ for APK..." -ForegroundColor Yellow
if (Test-Path "www") { Remove-Item -Recurse -Force "www" }
Copy-Item -Recurse "frontend\dist" "www"
Write-Host "  www/ ready." -ForegroundColor Green

# 3. Copy backend source to project root so p4a can find the meowprinter package
Write-Host "[3/4] Preparing Python source..." -ForegroundColor Yellow
if (Test-Path "meowprinter") { Remove-Item -Recurse -Force "meowprinter" }
Copy-Item -Recurse "backend\src\meowprinter" "meowprinter"
# Copy locale files into the package for Android
Copy-Item -Recurse "frontend\public\locales" "meowprinter\locales" -Force -ErrorAction SilentlyContinue
Write-Host "  Python source ready." -ForegroundColor Green

# 4. Run Buildozer in Docker
Write-Host "[4/4] Building APK with Docker (this takes a while on first run)..." -ForegroundColor Yellow
Write-Host "  Mode: $Mode" -ForegroundColor Gray
Write-Host ""

$projectDir = (Get-Location).Path -replace '\\','/'
# Convert Windows path to Docker-compatible format
$dockerPath = $projectDir -replace '^([A-Za-z]):','/$1'.ToLower()
# Ensure .buildozer cache exists for faster rebuilds
$cacheDir = "$env:USERPROFILE\.buildozer" -replace '\\','/'
$cacheDocker = $cacheDir -replace '^([A-Za-z]):','/$1'.ToLower()
if (-not (Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir | Out-Null }

# Use build-helper.sh inside the container to install platforms;android-33
# and run buildozer. Self-heals: if SDK not yet cached, downloads it on first
# attempt then installs the platform and retries automatically.
# Cache mounts to /root/.buildozer because the container runs as root (HOME=/root)
docker run --rm `
    --entrypoint bash `
    -v "${projectDir}:/home/user/hostcwd" `
    -v "${cacheDir}:/root/.buildozer" `
    kivy/buildozer:latest `
    /home/user/hostcwd/build-helper.sh $Mode

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=== BUILD SUCCESSFUL ===" -ForegroundColor Green
    Write-Host "APK location:" -ForegroundColor Cyan
    Get-ChildItem -Recurse "bin\*.apk" | ForEach-Object { Write-Host "  $($_.FullName)" -ForegroundColor White }
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "=== BUILD FAILED ===" -ForegroundColor Red
    Write-Host "Check the output above for errors." -ForegroundColor Yellow
    exit 1
}

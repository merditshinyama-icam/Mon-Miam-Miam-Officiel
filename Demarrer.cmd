@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Installez Node.js 22.12 ou plus recent, puis relancez ce fichier.
  pause
  exit /b 1
)
node scripts/launch.mjs
pause

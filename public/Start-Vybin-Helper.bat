@echo off
title VY/BIN Command Center helper
cd /d "%~dp0"
node vybin-bridge.mjs
echo.
echo The helper stopped. Press any key to close this window.
pause >nul

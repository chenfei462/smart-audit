@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0archive-audit-log.ps1" %*
exit /b %ERRORLEVEL%

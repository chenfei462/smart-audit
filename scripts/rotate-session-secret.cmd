@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0rotate-session-secret.ps1" %*

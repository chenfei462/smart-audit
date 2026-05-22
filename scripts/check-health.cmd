@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0check-health.ps1" %*

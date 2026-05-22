@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0restore-platform-db.ps1" %*

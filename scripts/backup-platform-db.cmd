@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0backup-platform-db.ps1" %*

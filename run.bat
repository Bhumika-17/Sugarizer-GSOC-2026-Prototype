@echo off
taskkill /F /IM chrome.exe >nul 2>&1
timeout /t 1 >nul
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --allow-file-access-from-files "file:///C:/GSOC 2026/sugarizer prototype/index.html"
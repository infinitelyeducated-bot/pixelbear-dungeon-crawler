@echo off
title PixelBear Dungeon Crawler
cd /d "%~dp0"
echo Starting PixelBear Dungeon Crawler...
echo (keep this window open while you play; close it to stop the server)
echo.
if not exist node_modules (
    echo First run: installing dependencies...
    call npm install --silent
)
start "" http://localhost:8080/crawler.html
node stamp-version.cjs
node server.js
pause

@echo off
rem Snifferoo — double-click to open the numbered screen gallery (01-18).
rem Starts the Lab dev server if it isn't already running, then opens the
rem gallery. Needs Node >= 18 (the project's only Windows tool requirement).
cd /d "%~dp0"
start "snifferoo-lab" /min node Tools\serve-lab.mjs
timeout /t 1 /nobreak >nul
start "" "http://localhost:8787/Lab/gallery.html"

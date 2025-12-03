@echo off
REM --- run_bridge.bat (Robust Launcher) ---
REM This script ensures Node.js and npm are installed, installs dependencies, and runs the server.

echo Starting environment check for Node.js Bridge Server...

REM 1. Check for Node.js (and implicitly checks if the 'node' command is in the system PATH)
where node >nul 2>nul
if %errorlevel% neq 0 (
goto :INSTALL_NODE
)
echo Node.js is installed. Version:
node -v

REM 2. Check for npm (and implicitly checks if the 'npm' command is in the system PATH)
where npm >nul 2>nul
if %errorlevel% neq 0 (
goto :NPM_ERROR
)
echo npm is installed.

REM 3. Install modules and run server
echo.
echo =====================================================================
echo Running 'npm install express serialport' then starting the server...
echo Standard output will appear here. Press Ctrl+C to stop the server.
echo =====================================================================

REM Using &&: The 'node' command only executes if 'npm install' returns success (exit code 0).
npm install express serialport && (
echo Dependencies successfully installed.
echo Starting Node.js Bridge Server: my-bridge-server.js...
node my-bridge-server.js
)

echo.
echo Server execution finished.
goto :END

:INSTALL_NODE
echo.
echo =====================================================================
echo ERROR: Node.js was not found on your system.
echo =====================================================================
echo.
echo Node.js is required to run the server. Please install it first.
echo Visit https://nodejs.org/ and download the LTS version.
echo Make sure the option to add Node.js to your system PATH is selected during installation.
goto :END

:NPM_ERROR
echo.
echo =====================================================================
echo ERROR: The Node Package Manager (npm) command was not found.
echo =====================================================================
echo.
echo Node.js should automatically install npm, but sometimes it requires a restart or repair.
echo Please ensure Node.js is correctly installed and your system has been restarted.
goto :END

:END
pause
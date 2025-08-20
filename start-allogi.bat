@echo off
setlocal enableextensions

REM Determine base directory (this script's directory)
set "BASEDIR=%~dp0"
set "SERVER_DIR=%BASEDIR%server"
set "VIEWER_DIR=%BASEDIR%viewer-app"

REM Commands and args
set "command=%~1"
if "%command%"=="" set "command=start"
set "duration=%~2"
REM Default to no auto-stop unless explicitly provided
if "%duration%"=="" set "duration="

REM Optional: configure ports/URLs
if not defined ALLOG_PORT set "ALLOG_PORT=3002"
if not defined ALLOG_VIEWER_PORT set "ALLOG_VIEWER_PORT=3001"
if not defined ALLOG_INTERMEDIARY_URL set "ALLOG_INTERMEDIARY_URL=http://localhost:%ALLOG_PORT%"

REM Route commands (start uses interactive agent mode)
if /i "%command%"=="start" goto :agent_mode
if /i "%command%"=="stop" goto :stop_allogi

echo Usage: %~n0 start [duration_seconds] ^| stop [basic ^| murder]
echo   start:   interactive agent mode (single-key commands), optional duration (default %duration%s)
echo   stop:    stops processes via Node utility; add 'murder' to also kill bash.exe
echo   Examples: %~n0 start 45  ^|  %~n0 stop  ^|  %~n0 stop murder
exit /b 1

:agent_mode
echo Launching allogi-agent.js (interactive)...
pushd "%BASEDIR%"
if defined duration (
  node allogi-agent.js %duration%
) else (
  node allogi-agent.js
)
popd
goto :eof

:stop_allogi
set "mode=%~2"
if "%mode%"=="" set "mode=basic"
echo Stopping via Node utility (mode=%mode%)...
pushd "%BASEDIR%"
node allogi-stop.js %mode%
popd

echo Done.
endlocal
exit /b 0

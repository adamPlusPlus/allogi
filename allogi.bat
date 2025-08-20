@echo off
setlocal enableextensions
pushd "%~dp0"

REM Set Node.js flags to suppress deprecation warnings by default
set NODE_OPTIONS=--no-deprecation --no-warnings

if "%~1"=="" (
  echo Usage: allogi.bat ^<start [duration]^|stop [basic^|murder]^|status^|ports^>
  echo.
  echo Commands:
  echo   start [duration]   Starts server and viewer. Optional auto-stop duration in seconds.
  echo   stop [mode]        Stops processes. mode: basic ^(default^) or murder ^(also kills bash.exe^)
  echo   status             Shows PIDs of processes started in this session
  echo   ports              Lists listeners on common ports ^(3001-3005^)
  echo.
  echo Examples:
  echo   allogi.bat start
  echo   allogi.bat start 60
  echo   allogi.bat stop
  echo   allogi.bat stop murder
  echo   allogi.bat status
  echo   allogi.bat ports
  echo.
  echo Note: Deprecation warnings are automatically suppressed.
  set "code=0"
) else (
  node allogi.js %*
  set "code=%errorlevel%"
)

popd
endlocal & exit /b %code%

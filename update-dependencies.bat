@echo off
echo Cleaning up old dependencies to fix util._extend deprecation warnings...
echo.

echo Removing old node_modules and package-lock.json files...
if exist "node_modules" rmdir /s /q "node_modules"
if exist "package-lock.json" del "package-lock.json"
if exist "server\node_modules" rmdir /s /q "server\node_modules"
if exist "server\package-lock.json" del "server\package-lock.json"
if exist "viewer-app\node_modules" rmdir /s /q "viewer-app\node_modules"
if exist "viewer-app\package-lock.json" del "viewer-app\package-lock.json"

echo.
echo Installing updated dependencies...
call npm install

echo.
echo Installing server dependencies...
cd server
call npm install
cd ..

echo.
echo Installing viewer-app dependencies...
cd viewer-app
call npm install
cd ..

echo.
echo Dependencies updated! The util._extend deprecation warnings should now be resolved.
echo.
pause

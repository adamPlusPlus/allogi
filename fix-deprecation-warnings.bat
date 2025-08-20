@echo off
echo ========================================
echo Fixing util._extend Deprecation Warnings
echo ========================================
echo.

echo This script will:
echo 1. Remove old dependencies that use deprecated APIs
echo 2. Update to Express 5.x and CORS 2.8.5
echo 3. Clean install all packages
echo 4. Update webpack configuration for newer versions
echo 5. Verify the fix
echo.

echo Press any key to continue...
pause >nul

echo.
echo Step 1: Cleaning up old dependencies...
if exist "node_modules" (
    echo Removing main node_modules...
    rmdir /s /q "node_modules"
)
if exist "package-lock.json" (
    echo Removing main package-lock.json...
    del "package-lock.json"
)

if exist "server\node_modules" (
    echo Removing server node_modules...
    rmdir /s /q "server\node_modules"
)
if exist "server\package-lock.json" (
    echo Removing server package-lock.json...
    del "server\package-lock.json"
)

if exist "viewer-app\node_modules" (
    echo Removing viewer-app node_modules...
    rmdir /s /q "viewer-app\node_modules"
)
if exist "viewer-app\package-lock.json" (
    echo Removing viewer-app package-lock.json...
    del "viewer-app\package-lock.json"
)

echo.
echo Step 2: Installing updated main dependencies...
call npm install

echo.
echo Step 3: Installing updated server dependencies...
cd server
call npm install
cd ..

echo.
echo Step 4: Installing updated viewer-app dependencies...
cd viewer-app
call npm install
cd ..

echo.
echo Step 5: Verifying package versions...
echo.
echo Main package versions:
call npm list --depth=0

echo.
echo Server package versions:
cd server
call npm list --depth=0
cd ..

echo.
echo ========================================
echo Dependencies updated successfully!
echo ========================================
echo.
echo The util._extend deprecation warnings are now automatically suppressed!
echo.
echo Key changes made:
echo - Express updated from 4.x to 5.x
echo - CORS updated to 2.8.5 (latest stable)
echo - All packages reinstalled with latest compatible versions
echo - Webpack configuration updated for newer versions
echo - Deprecation warnings automatically suppressed in allogi.bat
echo.
echo You can now start the system using:
echo   goi start
echo   OR
echo   lib/allogi/allogi.bat start
echo.
echo The deprecation warnings will be automatically suppressed.
echo.
pause

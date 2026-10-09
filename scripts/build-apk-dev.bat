@echo off
setlocal

set "VERSION=%~1"
set "NO_PAUSE=0"
if /I "%~2"=="--no-pause" set "NO_PAUSE=1"
set "ROOT_DIR=%~dp0.."
for %%I in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fI"
set "EXPO_DIR=%ROOT_DIR%\expo"
set "ENV_FILE=%EXPO_DIR%\.env"

if not defined VERSION (
    echo Usage: %~nx0 ^<major.minor.patch^>
    exit /b 1
)

if not defined ANDROID_HOME set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not exist "%ANDROID_HOME%" (
    echo ERROR: Android SDK not found at "%ANDROID_HOME%".
    exit /b 1
)

if not exist "%ENV_FILE%" (
    echo ERROR: Missing "%ENV_FILE%".
    exit /b 1
)
for /F "usebackq eol=# tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
    if not "%%A"=="" set "%%A=%%B"
)

echo [1/6] Sync version %VERSION%
node "%~dp0update-mobile-version.mjs" "%VERSION%"
if errorlevel 1 goto :fail

set "APP_VARIANT=dev"
set "SENTRY_DISABLE_AUTO_UPLOAD=true"
node "%~dp0verify-expo-build-env.mjs" dev
if errorlevel 1 goto :fail

echo [2/6] Stop Gradle
if exist "%EXPO_DIR%\android\gradlew.bat" call "%EXPO_DIR%\android\gradlew.bat" --stop

echo [3/6] Clean native cache
if exist "%EXPO_DIR%\node_modules\react-native-reanimated\android\.cxx" (
    rmdir /s /q "%EXPO_DIR%\node_modules\react-native-reanimated\android\.cxx"
)

echo [4/6] Generate Android dev project
rem Expo SDK 57 autolinking resolves package.json via the real project path.
pushd "%EXPO_DIR%"
call npx expo prebuild --platform android --clean
if errorlevel 1 (
    popd
    goto :fail
)
popd

echo [6/6] Build release APK
pushd "%EXPO_DIR%\android"
call "%EXPO_DIR%\android\gradlew.bat" assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64 --console=plain
if errorlevel 1 (
    popd
    goto :fail
)
popd

set "ARTIFACT_DIR=%ROOT_DIR%\artifacts\apk"
if not exist "%ARTIFACT_DIR%" mkdir "%ARTIFACT_DIR%"
copy /Y "%EXPO_DIR%\android\app\build\outputs\apk\release\app-release.apk" "%ARTIFACT_DIR%\21life-dev-v%VERSION%.apk" >nul
if errorlevel 1 goto :fail

call :cleanup
echo BUILD OK: %ARTIFACT_DIR%\21life-dev-v%VERSION%.apk
if "%NO_PAUSE%"=="0" pause
exit /b 0

:fail
set "BUILD_EXIT=%ERRORLEVEL%"
if "%BUILD_EXIT%"=="0" set "BUILD_EXIT=1"
call :cleanup
echo BUILD FAILED. Version files remain updated to %VERSION%.
if "%NO_PAUSE%"=="0" pause
exit /b %BUILD_EXIT%

:cleanup
exit /b 0

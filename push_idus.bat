
@echo off
setlocal
title IDUS GitHub Automation
cd /d "%~dp0"

echo ==========================================
echo           IDUS GITHUB AUTOMATION
echo ==========================================
echo.

where git >nul 2>&1
if errorlevel 1 (
    echo ERROR: Git is not installed or not in PATH.
    pause
    exit /b 1
)

if not exist "idus-app\.git" (
    echo ERROR: idus-app Git repository was not found.
    pause
    exit /b 1
)

if not exist "idus-api" (
    echo ERROR: idus-api folder was not found.
    pause
    exit /b 1
)

if not exist ".gitignore" (
    (
        echo .env
        echo .env.*
        echo !.env.example
        echo node_modules/
        echo .expo/
        echo dist/
        echo build/
        echo *.log
    ) > ".gitignore"
)

set "GIT_BASH=%ProgramFiles%\Git\git-bash.exe"
if not exist "%GIT_BASH%" set "GIT_BASH=%LocalAppData%\Programs\Git\git-bash.exe"

if not exist "%GIT_BASH%" (
    echo ERROR: Git Bash was not found.
    pause
    exit /b 1
)

echo Opening Git Bash...
start "IDUS GitHub Automation" "%GIT_BASH%" --cd="%~dp0" -c "bash push_idus.sh; echo; read -p 'Press Enter to close...'"

exit /b 0

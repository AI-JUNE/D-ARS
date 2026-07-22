@echo off
setlocal
cd /d "%~dp0dars" || (echo [ERR] dars folder not found & pause & exit /b 1)
echo === Working dir: %CD%
echo.
echo === [0/5] git identity
git config user.name >nul 2>&1 || git config user.name "GOWON Deploy"
git config user.email >nul 2>&1 || git config user.email "deploy@gowon.local"
git config user.name
git config user.email
echo.
echo === [1/5] npm ci
call npm ci
if errorlevel 1 (echo [ERR] npm ci failed & pause & exit /b 1)
echo.
echo === [2/5] npm test
call npm test
if errorlevel 1 (echo [ERR] tests failed - aborting & pause & exit /b 1)
echo.
echo === [3/5] npm run build
call npm run build
if errorlevel 1 (echo [ERR] build failed - aborting & pause & exit /b 1)
echo.
echo === [4/5] sync with remote (keep good globals.css from origin)
git fetch origin
if errorlevel 1 (echo [ERR] git fetch failed & pause & exit /b 1)
git checkout origin/main -- app/globals.css
echo.
echo --- changes to be committed ---
git status --short
echo.
set /p GO="Commit and push to origin/main? (y/N): "
if /i not "%GO%"=="y" (echo Cancelled. & pause & exit /b 0)
echo === [5/5] commit and push
git add -A
git commit -m "auto(night): 11-26 backlog batch (list UX, exports, row selection, portable test gate)"
git pull --rebase origin main
if errorlevel 1 (echo [ERR] rebase conflict - resolve, then: git rebase --continue then git push origin main & pause & exit /b 1)
git push origin main
if errorlevel 1 (echo [ERR] push failed - check git credentials & pause & exit /b 1)
echo.
git log --oneline -1
echo === DONE. Vercel deploys in about 60-90 seconds.
pause

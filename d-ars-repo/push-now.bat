@echo off
setlocal
echo === [0/4] clear stale git locks
del /f /q "%~dp0..\.git\index.lock" 2>nul
del /f /q "%~dp0..\.git\HEAD.lock" 2>nul
del /f /q "%~dp0..\.git\config.lock" 2>nul
echo   locks cleared
echo.
cd /d "%~dp0dars" || (echo [ERR] dars folder not found & pause & exit /b 1)
echo === repo: %CD%
echo.
echo === [1/4] git identity
git config user.name >nul 2>&1 || git config user.name "GOWON Deploy"
git config user.email >nul 2>&1 || git config user.email "deploy@gowon.local"
git config user.name
echo.
echo === [2/4] stage + commit app folder (if anything new)
git fetch origin
if errorlevel 1 (echo [ERR] git fetch failed & pause & exit /b 1)
git checkout origin/main -- app/globals.css
git add -A .
git commit -m "night backlog + api auth guard (middleware protects /api)"
echo   (if it says nothing to commit, the earlier commit already succeeded - fine)
echo.
echo === [3/4] rebase onto origin/main (autostash root leftovers)
git pull --rebase --autostash origin main
if errorlevel 1 (echo [ERR] rebase failed - resolve conflicts, then: git rebase --continue and git push origin main & pause & exit /b 1)
echo.
echo === [4/4] push
git push origin main
if errorlevel 1 (echo [ERR] push failed - check git credentials & pause & exit /b 1)
echo.
echo === pushed:
git log --oneline -1
echo === DONE. Vercel deploys in about 60-90 seconds.
pause

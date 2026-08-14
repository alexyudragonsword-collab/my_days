@echo off
setlocal
cd /d "%~dp0"
call npm run app:start
if errorlevel 1 (
  echo.
  echo 个人工作台启动失败，请确认已安装 Node.js 18 或更高版本，并已运行 npm install。
  pause
)
endlocal

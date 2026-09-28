@echo off
rem 数学小助手 · 一键启动后端
rem 双击本文件即可启动服务，启动后：
rem   入口页  http://127.0.0.1:8787/
rem   学生端  http://127.0.0.1:8787/student
rem   家长端  http://127.0.0.1:8787/parent
rem 保持本窗口开着服务就在运行；关闭窗口即停止服务。

cd /d %~dp0server

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先到 https://nodejs.org 安装。
  pause
  exit /b 1
)

echo 正在启动数学辅导后端 ...
node server.js
echo.
echo 服务已停止。
pause

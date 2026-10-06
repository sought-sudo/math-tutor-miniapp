@echo off
rem 小狐学堂 · 一键启动后端
rem 双击本文件即可启动服务，启动后：
rem   入口页  http://127.0.0.1:8787/
rem   学生端  http://127.0.0.1:8787/student
rem   家长端  http://127.0.0.1:8787/parent
rem 保持本窗口开着服务就在运行；关闭窗口即停止服务。

rem 【可选】接入视觉 OCR（图像识别题目），推荐智谱 glm-4v-flash（免费）：
rem   到 https://open.bigmodel.cn 注册并创建 API Key，然后去掉下面三行的 rem 并填入 key
rem set OCR_BASE_URL=https://open.bigmodel.cn/api/paas/v4
rem set OCR_API_KEY=你的智谱key
rem set OCR_MODEL=glm-4v-flash

cd /d %~dp0server

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先到 https://nodejs.org 安装。
  pause
  exit /b 1
)

echo 正在启动小狐学堂后端 ...
node server.js
echo.
echo 服务已停止。
pause

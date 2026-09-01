@echo off
chcp 65001 >nul
title FC内部AI生图工作台 - 本地版

echo ========================================
echo    FC内部AI生图工作台 - 本地版
echo ========================================
echo.

cd /d "%~dp0"

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18+
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [信息] 首次运行，正在安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

echo [信息] 启动开发服务器 (端口: 5175)...
echo [信息] 启动后自动打开浏览器
echo.

start "" "http://localhost:5175"
call npm run dev -- --port 5175 --host

pause

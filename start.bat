@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ================================================
echo    公务员晋升模拟器   一键启动
echo ================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo [x] 没找到 python。请先安装 Python 3.9 以上版本，
  echo     安装时记得勾选 "Add Python to PATH"。
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [x] 没找到 node。请先安装 Node.js 16 以上版本。
  echo.
  pause
  exit /b 1
)

echo [1/3] 检查后端依赖...
python -c "import fastapi, uvicorn" >nul 2>nul
if errorlevel 1 (
  echo       首次运行，正在安装（大约一分钟）...
  python -m pip install -r backend\requirements.txt
  if errorlevel 1 (
    echo [x] 后端依赖安装失败。
    pause
    exit /b 1
  )
) else (
  echo       已就绪。
)

echo [2/3] 构建前端...
if not exist "frontend\node_modules" (
  echo       首次运行，先装前端依赖（这一步比较久，几分钟）...
  pushd frontend
  call npm install
  if errorlevel 1 (
    popd
    echo [x] npm install 失败。
    pause
    exit /b 1
  )
  popd
)
pushd frontend
call npm run build
if errorlevel 1 (
  popd
  echo [x] 前端构建失败。
  pause
  exit /b 1
)
popd
echo       构建完成。

echo [3/3] 启动服务...
echo.
echo   浏览器打开：  http://127.0.0.1:8000
echo.
echo   存档存在浏览器里，关掉这个窗口不会丢。
echo   想关掉游戏，直接关掉这个黑窗口，或者按 Ctrl+C。
echo.

cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000
pause

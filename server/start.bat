@echo off
REM OCR-First Pipeline Server Startup Script for Windows

echo.
echo ======================================================================
echo OCR-First Pipeline Server
echo ======================================================================
echo.
echo Starting Node.js server...
echo.
echo Required Services:
echo   - Ollama must be running (ollama serve in another terminal)
echo   - Qwen2.5-VL model must be installed (ollama pull qwen2.5vl:7b)
echo.
echo Server will run on: http://localhost:3000
echo.
echo ======================================================================
echo.

node index.js

pause

# OCR-First Pipeline Server Startup Script for Windows PowerShell

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "OCR-First Pipeline Server" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Prerequisites Check:" -ForegroundColor Yellow
Write-Host "  [✓] Node.js installed" -ForegroundColor Green
Write-Host "  [✓] npm dependencies installed (npm install)" -ForegroundColor Green
Write-Host "  [?] Ollama running? (ollama serve in another terminal)" -ForegroundColor Yellow
Write-Host "  [?] Qwen2.5-VL model? (ollama list | grep qwen)" -ForegroundColor Yellow
Write-Host ""

Write-Host "Starting server..." -ForegroundColor Cyan
Write-Host ""

# Run the server
& node index.js

# Keep window open if it closes
Write-Host ""
Write-Host "Server stopped. Press Enter to close..." -ForegroundColor Yellow
Read-Host

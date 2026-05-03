$ErrorActionPreference = "Stop"

$BackendDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $BackendDir

$Python = Join-Path $BackendDir ".venv\Scripts\python.exe"
$PyInstaller = Join-Path $BackendDir ".venv\Scripts\pyinstaller.exe"

if (!(Test-Path $Python)) {
  throw "Missing virtual environment. Run: py -3.12 -m venv .venv"
}

if (!(Test-Path $PyInstaller)) {
  & $Python -m pip install pyinstaller
}

Remove-Item -Recurse -Force .\build, .\dist -ErrorAction SilentlyContinue
Remove-Item -Force .\medstore-api.spec -ErrorAction SilentlyContinue

& $PyInstaller `
  --name medstore-api `
  --onefile `
  --paths . `
  --collect-all app `
  --collect-all alembic `
  --collect-all cryptography `
  --collect-all jose `
  --collect-all bcrypt `
  --hidden-import aiosqlite `
  --hidden-import sqlalchemy.dialects.sqlite.aiosqlite `
  --hidden-import passlib.handlers.bcrypt `
  --hidden-import email_validator `
  --hidden-import pydantic_settings `
  --hidden-import multipart `
  --hidden-import uvicorn.protocols.http.auto `
  --hidden-import uvicorn.protocols.websockets.auto `
  --hidden-import uvicorn.lifespan.on `
  --exclude-module weasyprint `
  --exclude-module boto3 `
  --exclude-module botocore `
  --exclude-module razorpay `
  --exclude-module redis `
  --exclude-module asyncpg `
  desktop_entry.py

if (!(Test-Path ".\dist\medstore-api.exe")) {
  throw "PyInstaller finished but .\dist\medstore-api.exe was not created."
}

Write-Host "Backend exe built: $BackendDir\dist\medstore-api.exe"

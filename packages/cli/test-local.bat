@echo off
setlocal enabledelayedexpansion

echo.
echo 🧪 KxGen Agent - Local Test Runner
echo.

REM Check if .env.local exists
if not exist "..\..\\.env.local" (
    echo ⚠️  .env.local not found in project root!
    echo.
    echo Creating .env.local with default values...
    (
        echo AWS_REGION=us-east-1
        echo MESSAGES_TABLE=kx-messages
        echo CHANNELS_TABLE=kx-channels
        echo PERSONAS_TABLE=DelayedReplies-personas
        echo COMPANY_INFO_TABLE=DelayedReplies-company-info
        echo LEADS_TABLE=kx-leads
        echo BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
        echo HISTORY_LIMIT=50
    ) > ..\..\\.env.local
    echo ✅ Created .env.local
    echo ⚠️  Please update TENANT_ID and other values if needed!
    echo.
)

REM Check if TENANT_ID is set
if "%TENANT_ID%"=="" (
    echo ⚠️  TENANT_ID not set!
    echo.
    set /p TENANT_ID="Enter your tenant ID: "
    echo.
)

REM Build if needed
if not exist "lib" (
    echo 📦 Building CLI...
    call npm run build
    echo.
)

REM Generate unique conversation ID
for /f "tokens=1-4 delims=:., " %%a in ("%time%") do (
    set timestamp=%%a%%b%%c%%d
)
set CONV_ID=test-%timestamp%

echo 🚀 Starting local test with King Mo...
echo    Tenant ID: %TENANT_ID%
echo    Email: king-mo-test@local.com
echo    Conversation ID: %CONV_ID%
echo.
echo 💡 Tip: Press Ctrl+C to quit the chat
echo.

REM Run the CLI
node bin\kxagent.js chat --tenantId "%TENANT_ID%" --email "king-mo-test@local.com" --conversation-id "%CONV_ID%" --debug

endlocal


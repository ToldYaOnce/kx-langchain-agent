#!/bin/bash

# Auto-refresh CLI development script
echo "🔄 Starting CLI in watch mode..."
echo "Any changes to packages/ will trigger a restart"
echo ""

tsx watch packages/cli/bin/kxagent.ts "$@"


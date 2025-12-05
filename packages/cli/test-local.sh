#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 KxGen Agent - Local Test Runner${NC}"
echo ""

# Check if .env.local exists
if [ ! -f "../../.env.local" ]; then
    echo -e "${YELLOW}⚠️  .env.local not found in project root!${NC}"
    echo ""
    echo "Creating .env.local with default values..."
    cat > ../../.env.local << 'EOF'
AWS_REGION=us-east-1
MESSAGES_TABLE=kx-messages
CHANNELS_TABLE=kx-channels
PERSONAS_TABLE=DelayedReplies-personas
COMPANY_INFO_TABLE=DelayedReplies-company-info
LEADS_TABLE=kx-leads
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
HISTORY_LIMIT=50
EOF
    echo -e "${GREEN}✅ Created .env.local${NC}"
    echo -e "${YELLOW}⚠️  Please update TENANT_ID and other values if needed!${NC}"
    echo ""
fi

# Check if TENANT_ID is set
if [ -z "$TENANT_ID" ]; then
    echo -e "${YELLOW}⚠️  TENANT_ID not set!${NC}"
    echo ""
    read -p "Enter your tenant ID: " TENANT_ID
    export TENANT_ID
    echo ""
fi

# Build if needed
if [ ! -d "lib" ]; then
    echo -e "${BLUE}📦 Building CLI...${NC}"
    npm run build
    echo ""
fi

# Generate unique conversation ID
CONV_ID="test-$(date +%s)"

echo -e "${GREEN}🚀 Starting local test with King Mo...${NC}"
echo -e "   Tenant ID: ${BLUE}${TENANT_ID}${NC}"
echo -e "   Email: ${BLUE}king-mo-test@local.com${NC}"
echo -e "   Conversation ID: ${BLUE}${CONV_ID}${NC}"
echo ""
echo -e "${YELLOW}💡 Tip: Type 'exit' to quit the chat${NC}"
echo ""

# Load .env.local and run
export $(grep -v '^#' ../../.env.local | xargs)

node bin/kxagent.js chat \
  --tenantId "$TENANT_ID" \
  --email "king-mo-test@local.com" \
  --conversation-id "$CONV_ID" \
  --debug


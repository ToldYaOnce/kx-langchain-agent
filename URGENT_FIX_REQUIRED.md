# 🚨 URGENT: Consumer Must Switch to DelayedReplies Construct

## The Problem
You're still getting the cross-stack reference error because you're using `DelayedRepliesStack` as a **separate stack**. This creates cross-stack references that CDK doesn't allow.

## ❌ What You're Currently Doing (WRONG):
```typescript
// This creates a separate stack - causes cross-stack reference errors
const delayedRepliesStack = new DelayedRepliesStack(this, 'DelayedReplies', {
  // ... props
});
```

## ✅ What You MUST Do (CORRECT):
```typescript
// Import the construct, not the stack
import { DelayedReplies } from '@toldyaonce/kx-delayed-replies-infra';

export class KxGenStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Use as a construct WITHIN your existing stack
    const delayedReplies = new DelayedReplies(this, 'DelayedReplies', {
      eventBusName: 'your-event-bus',
      existingAgentLambdaArn: langchainAgent.agentFunction.functionArn,
      apiGatewayConfig: {
        existingApi: yourApiGateway,
        basePath: 'api'  // This now works with leading slash
      }
    });

    // All methods work the same way
    delayedReplies.grantSendToQueue(langchainAgent.agentFunction);
  }
}
```

## Required Changes:

1. **Change Import**:
   ```typescript
   // OLD
   import { DelayedRepliesStack } from '@toldyaonce/kx-delayed-replies-infra';
   
   // NEW
   import { DelayedReplies } from '@toldyaonce/kx-delayed-replies-infra';
   ```

2. **Change Instantiation**:
   ```typescript
   // OLD
   const delayedRepliesStack = new DelayedRepliesStack(this, 'DelayedReplies', props);
   
   // NEW
   const delayedReplies = new DelayedReplies(this, 'DelayedReplies', props);
   ```

3. **Update Dependencies**:
   ```bash
   npm install @toldyaonce/kx-delayed-replies-infra@latest
   ```

## Why This Fixes It:
- ✅ **No cross-stack references** - everything is in one stack
- ✅ **Same functionality** - all methods work identically  
- ✅ **Automatic API Gateway integration** - endpoints are created automatically
- ✅ **Explicit Lambda names** - no cross-environment issues

## The Fix is Already Published
Version 1.9.0 includes all the fixes for:
- Cross-stack references (use construct)
- Missing methods (`grantSendToQueue`)
- API Gateway path issues (handles `/api` and `api`)
- Duplicate resources (reuses existing)
- Cross-environment Lambda names (explicit names)

**You MUST make this change to proceed. The DelayedRepliesStack approach will never work due to CDK limitations.**


# Cross-Stack Reference Fix

## Problem
You're getting this error:
```
UnscopedValidationError: Stack "KxGenStack" cannot reference {KxGenStack/DelayedReplies/ReplyReleaseQueue/Resource[Ref]} in stack "KxGenStack/DelayedReplies". Cross stack references are only supported for stacks deployed to the same account or between nested stacks and their parent stack
```

## Root Cause
The issue occurs when you create `DelayedRepliesStack` as a **nested stack** within `KxGenStack`, then try to reference its resources from the parent stack. CDK doesn't allow cross-stack references in this scenario.

## Solution: Use DelayedReplies Construct Instead

### ❌ OLD (Causes Cross-Stack Reference Error):
```typescript
// In your KxGenStack
import { DelayedRepliesStack } from '@toldyaonce/kx-delayed-replies-infra';

export class KxGenStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // This creates a nested stack - causes cross-stack reference issues
    const delayedRepliesStack = new DelayedRepliesStack(this, 'DelayedReplies', {
      // ... props
    });

    // ❌ This will fail with cross-stack reference error
    const queue = delayedRepliesStack.releaseQueue;
  }
}
```

### ✅ NEW (Fixed - No Cross-Stack References):
```typescript
// In your KxGenStack
import { DelayedReplies } from '@toldyaonce/kx-delayed-replies-infra';

export class KxGenStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // This creates a construct within the same stack - no cross-stack references
    const delayedReplies = new DelayedReplies(this, 'DelayedReplies', {
      eventBusName: 'your-event-bus',
      existingAgentLambdaArn: 'arn:aws:lambda:...',
      apiGatewayConfig: {
        existingApi: yourApiGateway,
        basePath: 'agent'
      }
    });

    // ✅ This works - all resources are in the same stack
    const queue = delayedReplies.releaseQueue;
    const companyInfoTable = delayedReplies.companyInfoTable;
    
    // API Gateway endpoints are automatically created
  }
}
```

## Key Changes

1. **Import**: Change from `DelayedRepliesStack` to `DelayedReplies`
2. **Type**: Change from `DelayedRepliesStackProps` to `DelayedRepliesProps` 
3. **Usage**: Use as a construct within your existing stack, not as a separate stack

## Benefits of the New Approach

- ✅ **No cross-stack reference issues**
- ✅ **Automatic API Gateway integration** 
- ✅ **Follows CDK best practices**
- ✅ **Same pattern as kx-auth package**
- ✅ **All resources in one stack for easier management**

## Migration Steps

1. Update your imports:
   ```typescript
   // OLD
   import { DelayedRepliesStack } from '@toldyaonce/kx-delayed-replies-infra';
   
   // NEW  
   import { DelayedReplies } from '@toldyaonce/kx-delayed-replies-infra';
   ```

2. Change the instantiation:
   ```typescript
   // OLD
   const delayedRepliesStack = new DelayedRepliesStack(this, 'DelayedReplies', props);
   
   // NEW
   const delayedReplies = new DelayedReplies(this, 'DelayedReplies', props);
   ```

3. Update property access (same properties, different object):
   ```typescript
   // Both work the same way
   const queue = delayedReplies.releaseQueue;
   const table = delayedReplies.companyInfoTable;
   ```

4. **Deploy**: Run `cdk synth` to verify the fix, then `cdk deploy`

The `DelayedRepliesStack` is still available for backward compatibility, but we recommend using `DelayedReplies` construct to avoid these issues.


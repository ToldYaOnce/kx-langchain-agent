# Always-Active Goals Mode

## Overview
A new goal orchestration mode that treats goals as **opportunistic data collection checkpoints** rather than a rigid conversation script.

## Configuration

Set `strictOrdering: 0` in your goal configuration's `globalSettings`:

```json
{
  "goalConfiguration": {
    "enabled": true,
    "globalSettings": {
      "strictOrdering": 0,  // ✨ NEW: 0 = always-active mode
      "maxActiveGoals": 10,
      "maxGoalsPerTurn": 2
    },
    "goals": [...]
  }
}
```

## Behavior Comparison

| Setting | Mode | Behavior |
|---------|------|----------|
| `strictOrdering: 0` | **Always-Active** | All eligible goals are active simultaneously. Agent listens for opportunities to capture data naturally. |
| `strictOrdering: 1-6` | **Flexible** | Multiple goals can be active, with increasing preference for order. |
| `strictOrdering: 7-10` | **Strict** | Only ONE goal active at a time. Must complete in order. |

## How It Works

### Always-Active Mode (strictOrdering = 0)

1. **All Goals Active**: All eligible goals (based on triggers) are active simultaneously
2. **Opportunistic Capture**: Agent listens for ANY goal-related information in the conversation
3. **Natural Flow**: User can jump to ANY topic (scheduling, pricing, etc.) and the agent adapts
4. **Priority-Based Questions**: Follow-up questions prioritize highest-priority incomplete goals
5. **No Blocking**: A "ghost goal" or stuck goal won't prevent other goals from activating

### System Prompt Changes

**Always-Active Mode:**
```
💡 DATA COLLECTION AWARENESS:

You have multiple data collection goals active. Listen for opportunities to naturally capture:

• collect_identity: Get the user's name for personalization
• collect_contact_info: Get contact information for follow-up
• assess_fitness_goals: Understand what the user wants to achieve
• schedule_consultation: Book initial consultation or training session

⚠️ IMPORTANT: These are OPPORTUNISTIC. Only pursue when contextually relevant.
DO NOT force-fit these goals into every response. Let the conversation flow naturally.
If the user provides information related to ANY goal, acknowledge and capture it.
```

**Traditional Mode (strictOrdering ≥ 7):**
```
🚨 CRITICAL CONVERSATION FLOW - YOUR PRIMARY DIRECTIVE:

You are following a structured workflow. Focus on these goals IN ORDER:

1. GOAL: collect_identity
   Priority: 5/5 | Adherence: 6/10
   → Ask for the user's name early in the conversation

DO NOT ask random questions. FOCUS on the active goal above.
Your next question MUST move the conversation toward completing the top priority goal.
```

## Benefits

✅ **Natural Conversations**: User can bring up scheduling at any time, not forced through identity → contact → goals first
✅ **Intent Detection**: User says "9pm" or "pricing" → agent captures it immediately, even if not the "current" goal
✅ **No Ghost Goals**: Invalid/obsolete goals can't block progress since all valid goals are always active
✅ **Better UX**: Feels like talking to a smart human, not following a script

## Implementation Details

### Code Changes

1. **`goal-orchestrator.ts`**:
   - Added check for `strictOrdering === 0` in `applyGlobalConstraints()`
   - When detected, returns ALL eligible goals (bypasses ordering and max goals per turn)
   - Added ghost goal sanitization to filter out invalid goals on state load

2. **`agent.ts`**:
   - Updated `getSystemPrompt()` to detect always-active mode
   - Generates different system prompt based on mode
   - Updated question generation to prioritize by `priority` + `order` instead of just taking first goal

3. **Question Selection Logic**:
   ```typescript
   // Sort by priority (critical > high > medium > low) then by order
   const priorityValues = { critical: 4, high: 3, medium: 2, low: 1 };
   activeGoalConfigs.sort((a, b) => {
     const priorityDiff = priorityValues[b.config.priority] - priorityValues[a.config.priority];
     if (priorityDiff !== 0) return priorityDiff;
     return (a.config.order || 999) - (b.config.order || 999);
   });
   ```

## Migration Guide

### For Existing Tenants

**Option 1: Switch to Always-Active Mode (Recommended for most)**
```json
{
  "globalSettings": {
    "strictOrdering": 0,
    "maxActiveGoals": 10,
    "maxGoalsPerTurn": 2
  }
}
```

**Option 2: Keep Flexible Mode**
```json
{
  "globalSettings": {
    "strictOrdering": 3,  // Balanced
    "maxActiveGoals": 3,
    "maxGoalsPerTurn": 2
  }
}
```

**Option 3: Keep Strict Mode (only for highly structured flows)**
```json
{
  "globalSettings": {
    "strictOrdering": 7,
    "maxActiveGoals": 1,
    "maxGoalsPerTurn": 1
  }
}
```

## Testing Checklist

- [ ] Set `strictOrdering: 0` in goal config
- [ ] User mentions scheduling early in conversation
- [ ] Verify scheduling goal activates immediately (not blocked)
- [ ] Verify data is captured (check `capturedData` in logs)
- [ ] Verify event is emitted (`appointment.consultation_requested`)
- [ ] User jumps between topics (name → scheduling → goals → contact)
- [ ] Verify agent handles all topics smoothly
- [ ] Check system prompt in logs to confirm "💡 DATA COLLECTION AWARENESS" appears

## Known Issues / Limitations

- **Max goals per turn** is ignored in always-active mode (all goals are always active)
- **afterGoals** dependencies still apply (e.g., can't schedule until contact info collected if configured)
- **messageCount** thresholds still apply (e.g., won't ask about goals until message 3 if configured)

## Future Enhancements

1. **Smart Context Window**: Only show 3-5 most relevant goals in system prompt based on conversation context
2. **Dynamic Priority**: Increase priority of goals user shows interest in
3. **Cooldown Period**: After asking about a goal, wait N messages before asking again
4. **Completion Events**: Emit `agent.goal.activated` and `agent.goal.completed` events (already implemented, just need to deploy)

---

**Status**: ✅ Implemented, ready for deployment
**Date**: 2025-11-25
**Feature Flag**: `strictOrdering: 0` in goal configuration


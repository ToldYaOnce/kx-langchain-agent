# Planet Fitness Debug Map

## Numbered Instances for Tracking

All instances of "Planet Fitness" have been numbered to identify the source of hallucination:

| Number | Location | Context |
|--------|----------|---------|
| **1** | `greeting-service.ts:23` | Fallback for `companyInfo.name` in greeting generation |
| **2** | `greeting-service.ts:25` | Fallback for `companyInfo.description` in greeting generation |
| **3** | `greeting-service.ts:33` | Hardcoded fallback when no companyInfo (greeting) |
| **4** | `greeting-service.ts:35` | Hardcoded fallback description (greeting) |
| **5** | `greeting-service.ts:66` | Fallback for `companyInfo.name` in persona greeting |
| **6** | `greeting-service.ts:68` | Fallback for `companyInfo.description` in persona greeting |
| **7** | `greeting-service.ts:75` | Hardcoded fallback when no companyInfo (persona greeting) |
| **8** | `greeting-service.ts:77` | Hardcoded fallback description (persona greeting) |
| **9** | `agent.ts:516, 1204` | Fallback company info in agent (2 instances) |
| **10** | `personas.ts:144` | Carlos persona description |
| **11** | `personas.ts:145` | **Carlos persona system prompt** (MOST LIKELY CULPRIT) |
| **12** | `personas.ts:153` | Carlos persona "About Planet Fitness" section |

## How to Use

1. Run `npm run dev:chat`
2. Type: `Hi, I want to learn more`
3. Check the response for which number appears (e.g., "Planet Fitness11")
4. Match the number to the table above to identify the exact source

## Most Likely Culprits (in order)

1. **Planet Fitness11** - `personas.ts` line 145: The Carlos persona's system prompt has "Planet Fitness" hardcoded
2. **Planet Fitness9** - `agent.ts` lines 516/1204: Fallback company info in the agent
3. **Planet Fitness1-8** - `greeting-service.ts`: Greeting generation fallbacks

## Expected Result

If the issue is the persona system prompt (most likely), you'll see **"Planet Fitness11"** in the response.

If that's the case, the fix is to update `personas.json` (the Carlos persona) to use `{{companyName}}` template variables instead of hardcoded "Planet Fitness".


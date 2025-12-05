#!/usr/bin/env node

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import and run the TypeScript CLI (builds to lib/)
import('../lib/bin/kxagent.js').catch(console.error);

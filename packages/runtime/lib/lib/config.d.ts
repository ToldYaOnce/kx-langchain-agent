import type { RuntimeConfig } from '../types/index.js';
/**
 * Load runtime configuration from environment variables
 */
export declare function loadRuntimeConfig(): RuntimeConfig;
/**
 * Validate runtime configuration
 */
export declare function validateRuntimeConfig(config: RuntimeConfig): void;
/**
 * Create a test configuration for local development
 */
export declare function createTestConfig(overrides?: Partial<RuntimeConfig>): RuntimeConfig;

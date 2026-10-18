/**
 * Drizzle schema for Investy (apps/api).
 *
 * This module is now split into coherent submodules under `./schema/` to stay
 * under the 400-line project limit. It remains a single entry point so that all
 * existing imports continue to work (TASK-04 VERIFY 4).
 */
export * from './schema/enums.js';
export * from './schema/auth.js';
export * from './schema/portfolio.js';
export * from './schema/catalog.js';
export * from './schema/trading.js';
export * from './schema/analytics.js';
export * from './schema/relations.js';
export * from './schema/types.js';

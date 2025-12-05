/**
 * @fileoverview
 * Utilities for handling three-tier information sharing permissions.
 * Supports both the new informationCategories format (from UI) and legacy formats.
 */
import { InformationCategory, SharingPermissions } from '../types/dynamodb-schemas';
/**
 * Normalized three-tier sharing permissions
 */
export interface NormalizedSharingPermissions {
    alwaysAllowed: Set<string>;
    requiresContact: Set<string>;
    neverShare: Set<string>;
    defaultPermission: 'always_allowed' | 'contact_required' | 'never_share';
}
/**
 * Normalizes various sharing permission formats into a unified structure
 * Handles:
 * 1. informationCategories[] array (UI format)
 * 2. sharingPermissions with alwaysAllowed/requiresContact/neverShare arrays
 * 3. Legacy sharingPermissions.overrides format
 *
 * @param informationCategories - UI format categories
 * @param sharingPermissions - Direct permissions object
 * @returns Normalized permissions with Sets for fast lookup
 */
export declare function normalizeSharingPermissions(informationCategories?: InformationCategory[], sharingPermissions?: SharingPermissions): NormalizedSharingPermissions;
/**
 * Checks if a specific information category can be shared based on permission tier
 * Uses fuzzy matching (case-insensitive, substring matching)
 *
 * @param category - The information category to check (e.g., "Pricing", "membership info")
 * @param permissions - Normalized permissions
 * @param hasContactInfo - Whether we have the user's contact information
 * @returns Whether the information can be shared
 */
export declare function canShareInformation(category: string, permissions: NormalizedSharingPermissions, hasContactInfo: boolean): {
    allowed: boolean;
    reason: string;
};
/**
 * Generates a natural language explanation of sharing permissions
 * Useful for agent prompts and user transparency
 */
export declare function generateSharingGuidelines(permissions: NormalizedSharingPermissions): string;

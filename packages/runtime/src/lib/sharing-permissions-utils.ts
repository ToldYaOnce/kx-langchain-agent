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
export function normalizeSharingPermissions(
  informationCategories?: InformationCategory[],
  sharingPermissions?: SharingPermissions
): NormalizedSharingPermissions {
  const result: NormalizedSharingPermissions = {
    alwaysAllowed: new Set<string>(),
    requiresContact: new Set<string>(),
    neverShare: new Set<string>(),
    defaultPermission: 'contact_required'
  };

  // 1. Process informationCategories (UI format) - HIGHEST PRIORITY
  if (informationCategories && informationCategories.length > 0) {
    informationCategories.forEach(category => {
      const label = category.label.toLowerCase().trim();
      
      switch (category.column) {
        case 'always':
          result.alwaysAllowed.add(label);
          break;
        case 'require':
          result.requiresContact.add(label);
          break;
        case 'never':
          result.neverShare.add(label);
          break;
      }
    });
  }

  // 2. Process sharingPermissions arrays (if no categories)
  if (sharingPermissions) {
    // Set default permission
    if (sharingPermissions.defaultPermission) {
      result.defaultPermission = sharingPermissions.defaultPermission;
    } else if (sharingPermissions.default) {
      // Legacy format
      result.defaultPermission = sharingPermissions.default as any;
    }

    // Add array-based permissions (only if not already populated by categories)
    if (sharingPermissions.alwaysAllowed) {
      sharingPermissions.alwaysAllowed.forEach(item => {
        result.alwaysAllowed.add(item.toLowerCase().trim());
      });
    }
    
    if (sharingPermissions.requiresContact) {
      sharingPermissions.requiresContact.forEach(item => {
        result.requiresContact.add(item.toLowerCase().trim());
      });
    }
    
    if (sharingPermissions.neverShare) {
      sharingPermissions.neverShare.forEach(item => {
        result.neverShare.add(item.toLowerCase().trim());
      });
    }

    // 3. Process legacy overrides format (lowest priority)
    if (sharingPermissions.overrides) {
      Object.entries(sharingPermissions.overrides).forEach(([key, value]) => {
        const label = key.toLowerCase().trim();
        
        // Skip if already categorized by informationCategories
        if (informationCategories && informationCategories.some(c => 
          c.label.toLowerCase().trim() === label
        )) {
          return;
        }

        switch (value) {
          case 'always_allowed':
            result.alwaysAllowed.add(label);
            break;
          case 'contact_required':
            result.requiresContact.add(label);
            break;
          case 'never_share':
            result.neverShare.add(label);
            break;
        }
      });
    }
  }

  return result;
}

/**
 * Checks if a specific information category can be shared based on permission tier
 * Uses fuzzy matching (case-insensitive, substring matching)
 * 
 * @param category - The information category to check (e.g., "Pricing", "membership info")
 * @param permissions - Normalized permissions
 * @param hasContactInfo - Whether we have the user's contact information
 * @returns Whether the information can be shared
 */
export function canShareInformation(
  category: string,
  permissions: NormalizedSharingPermissions,
  hasContactInfo: boolean
): { allowed: boolean; reason: string } {
  const normalizedCategory = category.toLowerCase().trim();

  // Check never share list first (highest priority)
  for (const neverItem of permissions.neverShare) {
    if (normalizedCategory.includes(neverItem) || neverItem.includes(normalizedCategory)) {
      return {
        allowed: false,
        reason: `Information about "${category}" is not available through chat. Please contact us directly.`
      };
    }
  }

  // Check always allowed list
  for (const alwaysItem of permissions.alwaysAllowed) {
    if (normalizedCategory.includes(alwaysItem) || alwaysItem.includes(normalizedCategory)) {
      return {
        allowed: true,
        reason: 'Information is publicly available'
      };
    }
  }

  // Check requires contact list
  for (const requireItem of permissions.requiresContact) {
    if (normalizedCategory.includes(requireItem) || requireItem.includes(normalizedCategory)) {
      if (hasContactInfo) {
        return {
          allowed: true,
          reason: 'Contact information provided'
        };
      } else {
        return {
          allowed: false,
          reason: `I'd be happy to share information about ${category}, but I'll need your contact details first. What's the best email to reach you at?`
        };
      }
    }
  }

  // Fall back to default permission
  switch (permissions.defaultPermission) {
    case 'always_allowed':
      return { allowed: true, reason: 'Default: publicly available' };
    case 'never_share':
      return {
        allowed: false,
        reason: 'This information requires direct contact with our team.'
      };
    case 'contact_required':
    default:
      if (hasContactInfo) {
        return { allowed: true, reason: 'Default: contact provided' };
      } else {
        return {
          allowed: false,
          reason: `I'd be happy to help with that information, but I'll need your contact details first. What's your email address?`
        };
      }
  }
}

/**
 * Generates a natural language explanation of sharing permissions
 * Useful for agent prompts and user transparency
 */
export function generateSharingGuidelines(permissions: NormalizedSharingPermissions): string {
  const lines: string[] = [];

  if (permissions.alwaysAllowed.size > 0) {
    lines.push(`**Always share freely:** ${Array.from(permissions.alwaysAllowed).join(', ')}`);
  }

  if (permissions.requiresContact.size > 0) {
    lines.push(
      `**Require contact info before sharing:** ${Array.from(permissions.requiresContact).join(', ')}`
    );
  }

  if (permissions.neverShare.size > 0) {
    lines.push(
      `**Never share (direct user to contact team):** ${Array.from(permissions.neverShare).join(', ')}`
    );
  }

  lines.push(`**Default policy:** ${permissions.defaultPermission.replace('_', ' ')}`);

  return lines.join('\n');
}


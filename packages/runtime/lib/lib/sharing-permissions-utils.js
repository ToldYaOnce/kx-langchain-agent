"use strict";
/**
 * @fileoverview
 * Utilities for handling three-tier information sharing permissions.
 * Supports both the new informationCategories format (from UI) and legacy formats.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeSharingPermissions = normalizeSharingPermissions;
exports.canShareInformation = canShareInformation;
exports.generateSharingGuidelines = generateSharingGuidelines;
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
function normalizeSharingPermissions(informationCategories, sharingPermissions) {
    const result = {
        alwaysAllowed: new Set(),
        requiresContact: new Set(),
        neverShare: new Set(),
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
        }
        else if (sharingPermissions.default) {
            // Legacy format
            result.defaultPermission = sharingPermissions.default;
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
                if (informationCategories && informationCategories.some(c => c.label.toLowerCase().trim() === label)) {
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
function canShareInformation(category, permissions, hasContactInfo) {
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
            }
            else {
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
            }
            else {
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
function generateSharingGuidelines(permissions) {
    const lines = [];
    if (permissions.alwaysAllowed.size > 0) {
        lines.push(`**Always share freely:** ${Array.from(permissions.alwaysAllowed).join(', ')}`);
    }
    if (permissions.requiresContact.size > 0) {
        lines.push(`**Require contact info before sharing:** ${Array.from(permissions.requiresContact).join(', ')}`);
    }
    if (permissions.neverShare.size > 0) {
        lines.push(`**Never share (direct user to contact team):** ${Array.from(permissions.neverShare).join(', ')}`);
    }
    lines.push(`**Default policy:** ${permissions.defaultPermission.replace('_', ' ')}`);
    return lines.join('\n');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hhcmluZy1wZXJtaXNzaW9ucy11dGlscy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9saWIvc2hhcmluZy1wZXJtaXNzaW9ucy11dGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7R0FJRzs7QUF5Qkgsa0VBdUZDO0FBV0Qsa0RBZ0VDO0FBTUQsOERBc0JDO0FBek1EOzs7Ozs7Ozs7O0dBVUc7QUFDSCxTQUFnQiwyQkFBMkIsQ0FDekMscUJBQTZDLEVBQzdDLGtCQUF1QztJQUV2QyxNQUFNLE1BQU0sR0FBaUM7UUFDM0MsYUFBYSxFQUFFLElBQUksR0FBRyxFQUFVO1FBQ2hDLGVBQWUsRUFBRSxJQUFJLEdBQUcsRUFBVTtRQUNsQyxVQUFVLEVBQUUsSUFBSSxHQUFHLEVBQVU7UUFDN0IsaUJBQWlCLEVBQUUsa0JBQWtCO0tBQ3RDLENBQUM7SUFFRixrRUFBa0U7SUFDbEUsSUFBSSxxQkFBcUIsSUFBSSxxQkFBcUIsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDOUQscUJBQXFCLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFO1lBQ3ZDLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUM7WUFFbEQsUUFBUSxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ3hCLEtBQUssUUFBUTtvQkFDWCxNQUFNLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDaEMsTUFBTTtnQkFDUixLQUFLLFNBQVM7b0JBQ1osTUFBTSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQ2xDLE1BQU07Z0JBQ1IsS0FBSyxPQUFPO29CQUNWLE1BQU0sQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUM3QixNQUFNO1lBQ1YsQ0FBQztRQUNILENBQUMsQ0FBQyxD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SSxDQUNSLGtEQUFrRCxLQUFLLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FDbEcsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsSUFBSSxDQUFDLHVCQUF1QixXQUFXLENBQUMsaUJBQWlCLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7SUFFckYsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzFCLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogQGZpbGVvdmVydmlld1xyXG4gKiBVdGlsaXRpZXMgZm9yIGhhbmRsaW5nIHRocmVlLXRpZXIgaW5mb3JtYXRpb24gc2hhcmluZyBwZXJtaXNzaW9ucy5cclxuICogU3VwcG9ydHMgYm90aCB0aGUgbmV3IGluZm9ybWF0aW9uQ2F0ZWdvcmllcyBmb3JtYXQgKGZyb20gVUkpIGFuZCBsZWdhY3kgZm9ybWF0cy5cclxuICovXHJcblxyXG5pbXBvcnQgeyBJbmZvcm1hdGlvbkNhdGVnb3J5LCBTaGFyaW5nUGVybWlzc2lvbnMgfSBmcm9tICcuLi90eXBlcy9keW5hbW9kYi1zY2hlbWFzJztcclxuXHJcbi8qKlxyXG4gKiBOb3JtYWxpemVkIHRocmVlLXRpZXIgc2hhcmluZyBwZXJtaXNzaW9uc1xyXG4gKi9cclxuZXhwb3J0IGludGVyZmFjZSBOb3JtYWxpemVkU2hhcmluZ1Blcm1pc3Npb25zIHtcclxuICBhbHdheXNBbGxvd2VkOiBTZXQ8c3RyaW5nPjtcclxuICByZXF1aXJlc0NvbnRhY3Q6IFNldDxzdHJpbmc+O1xyXG4gIG5ldmVyU2hhcmU6IFNldDxzdHJpbmc+O1xyXG4gIGRlZmF1bHRQZXJtaXNzaW9uOiAnYWx3YXlzX2FsbG93ZWQnIHwgJ2NvbnRhY3RfcmVxdWlyZWQnIHwgJ25ldmVyX3NoYXJlJztcclxufVxyXG5cclxuLyoqXHJcbiAqIE5vcm1hbGl6ZXMgdmFyaW91cyBzaGFyaW5nIHBlcm1pc3Npb24gZm9ybWF0cyBpbnRvIGEgdW5pZmllZCBzdHJ1Y3R1cmVcclxuICogSGFuZGxlczpcclxuICogMS4gaW5mb3JtYXRpb25DYXRlZ29yaWVzW10gYXJyYXkgKFVJIGZvcm1hdClcclxuICogMi4gc2hhcmluZ1Blcm1pc3Npb25zIHdpdGggYWx3YXlzQWxsb3dlZC9yZXF1aXJlc0NvbnRhY3QvbmV2ZXJTaGFyZSBhcnJheXNcclxuICogMy4gTGVnYWN5IHNoYXJpbmdQZXJtaXNzaW9ucy5vdmVycmlkZXMgZm9ybWF0XHJcbiAqIFxyXG4gKiBAcGFyYW0gaW5mb3JtYXRpb25DYXRlZ29yaWVzIC0gVUkgZm9ybWF0IGNhdGVnb3JpZXNcclxuICogQHBhcmFtIHNoYXJpbmdQZXJtaXNzaW9ucyAtIERpcmVjdCBwZXJtaXNzaW9ucyBvYmplY3RcclxuICogQHJldHVybnMgTm9ybWFsaXplZCBwZXJtaXNzaW9ucyB3aXRoIFNldHMgZm9yIGZhc3QgbG9va3VwXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplU2hhcmluZ1Blcm1pc3Npb25zKFxyXG4gIGluZm9ybWF0aW9uQ2F0ZWdvcmllcz86IEluZm9ybWF0aW9uQ2F0ZWdvcnlbXSxcclxuICBzaGFyaW5nUGVybWlzc2lvbnM/OiBTaGFyaW5nUGVybWlzc2lvbnNcclxuKTogTm9ybWFsaXplZFNoYXJpbmdQZXJtaXNzaW9ucyB7XHJcbiAgY29uc3QgcmVzdWx0OiBOb3JtYWxpemVkU2hhcmluZ1Blcm1pc3Npb25zID0ge1xyXG4gICAgYWx3YXlzQWxsb3dlZDogbmV3IFNldDxzdHJpbmc+KCksXHJcbiAgICByZXF1aXJlc0NvbnRhY3Q6IG5ldyBTZXQ8c3RyaW5nPigpLFxyXG4gICAgbmV2ZXJTaGFyZTogbmV3IFNldDxzdHJpbmc+KCksXHJcbiAgICBkZWZhdWx0UGVybWlzc2lvbjogJ2NvbnRhY3RfcmVxdWlyZWQnXHJcbiAgfTtcclxuXHJcbiAgLy8gMS4gUHJvY2VzcyBpbmZvcm1hdGlvbkNhdGVnb3JpZXMgKFVJIGZvcm1hdCkgLSBISUdIRVNUIFBSSU9SSVRZXHJcbiAgaWYgKGluZm9ybWF0aW9uQ2F0ZWdvcmllcyAmJiBpbmZvcm1hdGlvbkNhdGVnb3JpZXMubGVuZ3RoID4gMCkge1xyXG4gICAgaW5mb3JtYXRpb25DYXRlZ29yaWVzLmZvckVhY2goY2F0ZWdvcnkgPT4ge1xyXG4gICAgICBjb25zdCBsYWJlbCA9IGNhdGVnb3J5LmxhYmVsLnRvTG93ZXJDYXNlKCkudHJpbSgpO1xyXG4gICAgICBcclxuICAgICAgc3dpdGNoIChjYXRlZ29yeS5jb2x1bW4pIHtcclxuICAgICAgICBjYXNlICdhbHdheXMnOlxyXG4gICAgICAgICAgcmVzdWx0LmFsd2F5c0FsbG93ZWQuYWRkKGxhYmVsKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgJ3JlcXVpcmUnOlxyXG4gICAgICAgICAgcmVzdWx0LnJlcXVpcmVzQ29udGFjdC5hZGQobGFiZWwpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAnbmV2ZXInOlxyXG4gICAgICAgICAgcmVzdWx0Lm5ldmVyU2hhcmUuYWRkKGxhYmVsKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8vIDIuIFByb2Nlc3Mgc2hhcmluZ1Blcm1pc3Npb25zIGFycmF5cyAoaWYgbm8gY2F0ZWdvcmllcylcclxuICBpZiAoc2hhcmluZ1Blcm1pc3Npb25zKSB7XHJcbiAgICAvLyBTZXQgZGVmYXVsdCBwZXJtaXNzaW9uXHJcbiAgICBpZiAoc2hhcmluZ1Blcm1pc3Npb25zLmRlZmF1bHRQZXJtaXNzaW9uKSB7XHJcbiAgICAgIHJlc3VsdC5kZWZhdWx0UGVybWlzc2lvbiA9IHNoYXJpbmdQZXJtaXNzaW9ucy5kZWZhdWx0UGVybWlzc2lvbjtcclxuICAgIH0gZWxzZSBpZiAoc2hhcmluZ1Blcm1pc3Npb25zLmRlZmF1bHQpIHtcclxuICAgICAgLy8gTGVnYWN5IGZvcm1hdFxyXG4gICAgICByZXN1bHQuZGVmYXVsdFBlcm1pc3Npb24gPSBzaGFyaW5nUGVybWlzc2lvbnMuZGVmYXVsdCBhcyBhbnk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQWRkIGFycmF5LWJhc2VkIHBlcm1pc3Npb25zIChvbmx5IGlmIG5vdCBhbHJlYWR5IHBvcHVsYXRlZCBieSBjYXRlZ29yaWVzKVxyXG4gICAgaWYgKHNoYXJpbmdQZXJtaXNzaW9ucy5hbHdheXNBbGxvd2VkKSB7XHJcbiAgICAgIHNoYXJpbmdQZXJtaXNzaW9ucy5hbHdheXNBbGxvd2VkLmZvckVhY2goaXRlbSA9PiB7XHJcbiAgICAgICAgcmVzdWx0LmFsd2F5c0FsbG93ZWQuYWRkKGl0ZW0udG9Mb3dlckNhc2UoKS50cmltKCkpO1xyXG4gICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKHNoYXJpbmdQZXJtaXNzaW9ucy5yZXF1aXJlc0NvbnRhY3QpIHtcclxuICAgICAgc2hhcmluZ1Blcm1pc3Npb25zLnJlcXVpcmVzQ29udGFjdC5mb3JFYWNoKGl0ZW0gPT4ge1xyXG4gICAgICAgIHJlc3VsdC5yZXF1aXJlc0NvbnRhY3QuYWRkKGl0ZW0udG9Mb3dlckNhc2UoKS50cmltKCkpO1xyXG4gICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKHNoYXJpbmdQZXJtaXNzaW9ucy5uZXZlclNoYXJlKSB7XHJcbiAgICAgIHNoYXJpbmdQZXJtaXNzaW9ucy5uZXZlclNoYXJlLmZvckVhY2goaXRlbSA9PiB7XHJcbiAgICAgICAgcmVzdWx0Lm5ldmVyU2hhcmUuYWRkKGl0ZW0udG9Mb3dlckNhc2UoKS50cmltKCkpO1xyXG4gICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyAzLiBQcm9jZXNzIGxlZ2FjeSBvdmVycmlkZXMgZm9ybWF0IChsb3dlc3QgcHJpb3JpdHkpXHJcbiAgICBpZiAoc2hhcmluZ1Blcm1pc3Npb25zLm92ZXJyaWRlcykge1xyXG4gICAgICBPYmplY3QuZW50cmllcyhzaGFyaW5nUGVybWlzc2lvbnMub3ZlcnJpZGVzKS5mb3JFYWNoKChba2V5LCB2YWx1ZV0pID0+IHtcclxuICAgICAgICBjb25zdCBsYWJlbCA9IGtleS50b0xvd2VyQ2FzZSgpLnRyaW0oKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBTa2lwIGlmIGFscmVhZHkgY2F0ZWdvcml6ZWQgYnkgaW5mb3JtYXRpb25DYXRlZ29yaWVzXHJcbiAgICAgICAgaWYgKGluZm9ybWF0aW9uQ2F0ZWdvcmllcyAmJiBpbmZvcm1hdGlvbkNhdGVnb3JpZXMuc29tZShjID0+IFxyXG4gICAgICAgICAgYy5sYWJlbC50b0xvd2VyQ2FzZSgpLnRyaW0oKSA9PT0gbGFiZWxcclxuICAgICAgICApKSB7XHJcbiAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBzd2l0Y2ggKHZhbHVlKSB7XHJcbiAgICAgICAgICBjYXNlICdhbHdheXNfYWxsb3dlZCc6XHJcbiAgICAgICAgICAgIHJlc3VsdC5hbHdheXNBbGxvd2VkLmFkZChsYWJlbCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAnY29udGFjdF9yZXF1aXJlZCc6XHJcbiAgICAgICAgICAgIHJlc3VsdC5yZXF1aXJlc0NvbnRhY3QuYWRkKGxhYmVsKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICBjYXNlICduZXZlcl9zaGFyZSc6XHJcbiAgICAgICAgICAgIHJlc3VsdC5uZXZlclNoYXJlLmFkZChsYWJlbCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gcmVzdWx0O1xyXG59XHJcblxyXG4vKipcclxuICogQ2hlY2tzIGlmIGEgc3BlY2lmaWMgaW5mb3JtYXRpb24gY2F0ZWdvcnkgY2FuIGJlIHNoYXJlZCBiYXNlZCBvbiBwZXJtaXNzaW9uIHRpZXJcclxuICogVXNlcyBmdXp6eSBtYXRjaGluZyAoY2FzZS1pbnNlbnNpdGl2ZSwgc3Vic3RyaW5nIG1hdGNoaW5nKVxyXG4gKiBcclxuICogQHBhcmFtIGNhdGVnb3J5IC0gVGhlIGluZm9ybWF0aW9uIGNhdGVnb3J5IHRvIGNoZWNrIChlLmcuLCBcIlByaWNpbmdcIiwgXCJtZW1iZXJzaGlwIGluZm9cIilcclxuICogQHBhcmFtIHBlcm1pc3Npb25zIC0gTm9ybWFsaXplZCBwZXJtaXNzaW9uc1xyXG4gKiBAcGFyYW0gaGFzQ29udGFjdEluZm8gLSBXaGV0aGVyIHdlIGhhdmUgdGhlIHVzZXIncyBjb250YWN0IGluZm9ybWF0aW9uXHJcbiAqIEByZXR1cm5zIFdoZXRoZXIgdGhlIGluZm9ybWF0aW9uIGNhbiBiZSBzaGFyZWRcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBjYW5TaGFyZUluZm9ybWF0aW9uKFxyXG4gIGNhdGVnb3J5OiBzdHJpbmcsXHJcbiAgcGVybWlzc2lvbnM6IE5vcm1hbGl6ZWRTaGFyaW5nUGVybWlzc2lvbnMsXHJcbiAgaGFzQ29udGFjdEluZm86IGJvb2xlYW5cclxuKTogeyBhbGxvd2VkOiBib29sZWFuOyByZWFzb246IHN0cmluZyB9IHtcclxuICBjb25zdCBub3JtYWxpemVkQ2F0ZWdvcnkgPSBjYXRlZ29yeS50b0xvd2VyQ2FzZSgpLnRyaW0oKTtcclxuXHJcbiAgLy8gQ2hlY2sgbmV2ZXIgc2hhcmUgbGlzdCBmaXJzdCAoaGlnaGVzdCBwcmlvcml0eSlcclxuICBmb3IgKGNvbnN0IG5ldmVySXRlbSBvZiBwZXJtaXNzaW9ucy5uZXZlclNoYXJlKSB7XHJcbiAgICBpZiAobm9ybWFsaXplZENhdGVnb3J5LmluY2x1ZGVzKG5ldmVySXRlbSkgfHwgbmV2ZXJJdGVtLmluY2x1ZGVzKG5vcm1hbGl6ZWRDYXRlZ29yeSkpIHtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBhbGxvd2VkOiBmYWxzZSxcclxuICAgICAgICByZWFzb246IGBJbmZvcm1hdGlvbiBhYm91dCBcIiR7Y2F0ZWdvcnl9XCIgaXMgbm90IGF2YWlsYWJsZSB0aHJvdWdoIGNoYXQuIFBsZWFzZSBjb250YWN0IHVzIGRpcmVjdGx5LmBcclxuICAgICAgfTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIENoZWNrIGFsd2F5cyBhbGxvd2VkIGxpc3RcclxuICBmb3IgKGNvbnN0IGFsd2F5c0l0ZW0gb2YgcGVybWlzc2lvbnMuYWx3YXlzQWxsb3dlZCkge1xyXG4gICAgaWYgKG5vcm1hbGl6ZWRDYXRlZ29yeS5pbmNsdWRlcyhhbHdheXNJdGVtKSB8fCBhbHdheXNJdGVtLmluY2x1ZGVzKG5vcm1hbGl6ZWRDYXRlZ29yeSkpIHtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBhbGxvd2VkOiB0cnVlLFxyXG4gICAgICAgIHJlYXNvbjogJ0luZm9ybWF0aW9uIGlzIHB1YmxpY2x5IGF2YWlsYWJsZSdcclxuICAgICAgfTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIENoZWNrIHJlcXVpcmVzIGNvbnRhY3QgbGlzdFxyXG4gIGZvciAoY29uc3QgcmVxdWlyZUl0ZW0gb2YgcGVybWlzc2lvbnMucmVxdWlyZXNDb250YWN0KSB7XHJcbiAgICBpZiAobm9ybWFsaXplZENhdGVnb3J5LmluY2x1ZGVzKHJlcXVpcmVJdGVtKSB8fCByZXF1aXJlSXRlbS5pbmNsdWRlcyhub3JtYWxpemVkQ2F0ZWdvcnkpKSB7XHJcbiAgICAgIGlmIChoYXNDb250YWN0SW5mbykge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBhbGxvd2VkOiB0cnVlLFxyXG4gICAgICAgICAgcmVhc29uOiAnQ29udGFjdCBpbmZvcm1hdGlvbiBwcm92aWRlZCdcclxuICAgICAgICB9O1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBhbGxvd2VkOiBmYWxzZSxcclxuICAgICAgICAgIHJlYXNvbjogYEknZCBiZSBoYXBweSB0byBzaGFyZSBpbmZvcm1hdGlvbiBhYm91dCAke2NhdGVnb3J5fSwgYnV0IEknbGwgbmVlZCB5b3VyIGNvbnRhY3QgZGV0YWlscyBmaXJzdC4gV2hhdCdzIHRoZSBiZXN0IGVtYWlsIHRvIHJlYWNoIHlvdSBhdD9gXHJcbiAgICAgICAgfTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLy8gRmFsbCBiYWNrIHRvIGRlZmF1bHQgcGVybWlzc2lvblxyXG4gIHN3aXRjaCAocGVybWlzc2lvbnMuZGVmYXVsdFBlcm1pc3Npb24pIHtcclxuICAgIGNhc2UgJ2Fsd2F5c19hbGxvd2VkJzpcclxuICAgICAgcmV0dXJuIHsgYWxsb3dlZDogdHJ1ZSwgcmVhc29uOiAnRGVmYXVsdDogcHVibGljbHkgYXZhaWxhYmxlJyB9O1xyXG4gICAgY2FzZSAnbmV2ZXJfc2hhcmUnOlxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGFsbG93ZWQ6IGZhbHNlLFxyXG4gICAgICAgIHJlYXNvbjogJ1RoaXMgaW5mb3JtYXRpb24gcmVxdWlyZXMgZGlyZWN0IGNvbnRhY3Qgd2l0aCBvdXIgdGVhbS4nXHJcbiAgICAgIH07XHJcbiAgICBjYXNlICdjb250YWN0X3JlcXVpcmVkJzpcclxuICAgIGRlZmF1bHQ6XHJcbiAgICAgIGlmIChoYXNDb250YWN0SW5mbykge1xyXG4gICAgICAgIHJldHVybiB7IGFsbG93ZWQ6IHRydWUsIHJlYXNvbjogJ0RlZmF1bHQ6IGNvbnRhY3QgcHJvdmlkZWQnIH07XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgIGFsbG93ZWQ6IGZhbHNlLFxyXG4gICAgICAgICAgcmVhc29uOiBgSSdkIGJlIGhhcHB5IHRvIGhlbHAgd2l0aCB0aGF0IGluZm9ybWF0aW9uLCBidXQgSSdsbCBuZWVkIHlvdXIgY29udGFjdCBkZXRhaWxzIGZpcnN0LiBXaGF0J3MgeW91ciBlbWFpbCBhZGRyZXNzP2BcclxuICAgICAgICB9O1xyXG4gICAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogR2VuZXJhdGVzIGEgbmF0dXJhbCBsYW5ndWFnZSBleHBsYW5hdGlvbiBvZiBzaGFyaW5nIHBlcm1pc3Npb25zXHJcbiAqIFVzZWZ1bCBmb3IgYWdlbnQgcHJvbXB0cyBhbmQgdXNlciB0cmFuc3BhcmVuY3lcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZVNoYXJpbmdHdWlkZWxpbmVzKHBlcm1pc3Npb25zOiBOb3JtYWxpemVkU2hhcmluZ1Blcm1pc3Npb25zKTogc3RyaW5nIHtcclxuICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgaWYgKHBlcm1pc3Npb25zLmFsd2F5c0FsbG93ZWQuc2l6ZSA+IDApIHtcclxuICAgIGxpbmVzLnB1c2goYCoqQWx3YXlzIHNoYXJlIGZyZWVseToqKiAke0FycmF5LmZyb20ocGVybWlzc2lvbnMuYWx3YXlzQWxsb3dlZCkuam9pbignLCAnKX1gKTtcclxuICB9XHJcblxyXG4gIGlmIChwZXJtaXNzaW9ucy5yZXF1aXJlc0NvbnRhY3Quc2l6ZSA+IDApIHtcclxuICAgIGxpbmVzLnB1c2goXHJcbiAgICAgIGAqKlJlcXVpcmUgY29udGFjdCBpbmZvIGJlZm9yZSBzaGFyaW5nOioqICR7QXJyYXkuZnJvbShwZXJtaXNzaW9ucy5yZXF1aXJlc0NvbnRhY3QpLmpvaW4oJywgJyl9YFxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIGlmIChwZXJtaXNzaW9ucy5uZXZlclNoYXJlLnNpemUgPiAwKSB7XHJcbiAgICBsaW5lcy5wdXNoKFxyXG4gICAgICBgKipOZXZlciBzaGFyZSAoZGlyZWN0IHVzZXIgdG8gY29udGFjdCB0ZWFtKToqKiAke0FycmF5LmZyb20ocGVybWlzc2lvbnMubmV2ZXJTaGFyZSkuam9pbignLCAnKX1gXHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgbGluZXMucHVzaChgKipEZWZhdWx0IHBvbGljeToqKiAke3Blcm1pc3Npb25zLmRlZmF1bHRQZXJtaXNzaW9uLnJlcGxhY2UoJ18nLCAnICcpfWApO1xyXG5cclxuICByZXR1cm4gbGluZXMuam9pbignXFxuJyk7XHJcbn1cclxuXHJcbiJdfQ==
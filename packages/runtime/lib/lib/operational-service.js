"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperationalService = void 0;
const operationalData = __importStar(require("../config/operational-data.json"));
class OperationalService {
    constructor() {
        this.data = operationalData;
    }
    /**
     * Get current operational hours for a location
     */
    getCurrentHours(context = {}) {
        const locationId = context.locationId || 'default';
        const location = this.data.locations[locationId];
        const now = context.currentDate || new Date();
        if (!location) {
            return { isOpen: false, hours: null, nextChange: 'Unknown location' };
        }
        const dayName = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        const hours = location.hours[dayName];
        if (!hours) {
            return { isOpen: false, hours: null, nextChange: 'Hours not available' };
        }
        // Check if it's 24 hours
        if (hours.is24Hours) {
            return {
                isOpen: true,
                hours,
                nextChange: 'Open 24 hours',
                specialNote: 'This location is open 24/7'
            };
        }
        // Parse current time and operating hours
        const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
        const isOpen = currentTime >= hours.open && currentTime <= hours.close;
        const nextChange = isOpen
            ? `Closes at ${this.formatTime(hours.close)}`
            : `Opens at ${this.formatTime(hours.open)}`;
        return { isOpen, hours, nextChange };
    }
    /**
     * Get current pricing information
     */
    getCurrentPricing() {
        const activePromotions = this.getActivePromotions();
        return {
            memberships: this.data.pricing.memberships,
            fees: this.data.pricing.fees,
            activePromotions
        };
    }
    /**
     * Get active promotions based on current date
     */
    getActivePromotions(context = {}) {
        const now = context.currentDate || new Date();
        const currentDateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format
        return this.data.promotions.active_sales.filter(promo => {
            if (promo.status !== 'active')
                return false;
            const startDate = new Date(promo.start_date);
            const endDate = new Date(promo.end_date);
            const currentDate = new Date(currentDateStr);
            return currentDate >= startDate && currentDate <= endDate;
        });
    }
    /**
     * Get membership details by ID
     */
    getMembership(membershipId) {
        return this.data.pricing.memberships.find(m => m.id === membershipId) || null;
    }
    /**
     * Get formatted pricing information for a membership
     */
    getFormattedPricing(membershipId) {
        const membership = this.getMembership(membershipId);
        if (!membership)
            return 'Membership not found';
        const activePromotions = this.getActivePromotions();
        const applicablePromos = activePromotions.filter(p => p.applies_to.includes(membershipId));
        let pricing = `${membership.name}: $${membership.price}/${membership.billing}`;
        if (applicablePromos.length > 0) {
            pricing += '\n\n🎉 Current Promotions:';
            applicablePromos.forEach(promo => {
                pricing += `\n• ${promo.name}: ${promo.description}`;
                pricing += `\n  Valid until ${this.formatDate(promo.end_date)}`;
            });
        }
        return pricing;
    }
    /**
     * Get services and amenities information
     */
    getServices() {
        return this.data.services;
    }
    /**
     * Get contact information
     */
    getContactInfo() {
        return this.data.contact;
    }
    /**
     * Get policies information
     */
    getPolicies() {
        return this.data.policies;
    }
    /**
     * Search for information based on query
     */
    searchOperationalInfo(query) {
        const results = [];
        const queryLower = query.toLowerCase();
        // Search in memberships
        this.data.pricing.memberships.forEach(membership => {
            let relevance = 0;
            if (membership.name.toLowerCase().includes(queryLower))
                relevance += 3;
            if (membership.features.some(f => f.toLowerCase().includes(queryLower)))
                relevance += 2;
            if (relevance > 0) {
                results.push({ type: 'membership', data: membership, relevance });
            }
        });
        // Search in promotions
        const activePromotions = this.getActivePromotions();
        activePromotions.forEach(promo => {
            let relevance = 0;
            if (promo.name.toLowerCase().includes(queryLower))
                relevance += 3;
            if (promo.description.toLowerCase().includes(queryLower))
                relevance += 2;
            if (promo.benefits.some(b => b.toLowerCase().includes(queryLower)))
                relevance += 1;
            if (relevance > 0) {
                results.push({ type: 'promotion', data: promo, relevance });
            }
        });
        // Search in services
        Object.entries(this.data.services).forEach(([serviceKey, service]) => {
            if (serviceKey.toLowerCase().includes(queryLower)) {
                results.push({ type: 'service', data: { key: serviceKey, ...service }, relevance: 2 });
            }
        });
        return results.sort((a, b) => b.relevance - a.relevance);
    }
    /**
     * Format time for display
     */
    formatTime(time) {
        const [hours, minutes] = time.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        return `${displayHour}:${minutes} ${ampm}`;
    }
    /**
     * Format date for display
     */
    formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    /**
     * Get all operational data (for admin/debugging)
     */
    getAllData() {
        return this.data;
    }
    /**
     * Update operational data (for future dynamic updates)
     */
    updateData(updates) {
        this.data = { ...this.data, ...updates };
    }
}
exports.OperationalService = OperationalService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3BlcmF0aW9uYWwtc2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9saWIvb3BlcmF0aW9uYWwtc2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpRkFBbUU7QUF3RG5FLE1BQWEsa0JBQWtCO0lBRzdCO1FBQ0UsSUFBSSxDQUFDLElBQUksR0FBRyxlQUFlLENBQUM7SUFDOUIsQ0FBQztJQUVEOztPQUVHO0lBQ0gsZUFBZSxDQUFDLFVBQThCLEVBQUU7UUFNOUMsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLFVBQVUsSUFBSSxTQUFTLENBQUM7UUFDbkQsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBOEMsQ0FBQyxDQUFDO1FBQ3JGLE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxXQUFXLElBQUksSUFBSSxJQUFJLEVBQUUsQ0FBQztRQUU5QyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDZCxPQUFPLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxrQkFBa0IsRUFBRSxDQUFDO1FBQ3hFLENBQUM7UUFFRCxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUMsa0JBQWtCLENBQUMsT0FBTyxFQUFFLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsV0FBVyxFQUFpQyxDQUFDO1FBQ2xILE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFxQixDQUFDO1FBRTFELElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNYLE9BQU8sRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLHFCQUFxQixFQUFFLENBQUM7UUFDM0UsQ0FBQztRQUVELHlCQUF5QjtRQUN6QixJQUFJ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RUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDbkUsT0FBTyxHQUFHLFdBQVcsSUFBSSxPQUFPLElBQUksSUFBSSxFQUFFLENBQUM7SUFDN0MsQ0FBQztJQUVEOztPQUVHO0lBQ0ssVUFBVSxDQUFDLE9BQWU7UUFDaEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDL0IsT0FBTyxJQUFJLENBQUMsa0JBQWtCLENBQUMsT0FBTyxFQUFFO1lBQ3RDLElBQUksRUFBRSxTQUFTO1lBQ2YsS0FBSyxFQUFFLE1BQU07WUFDYixHQUFHLEVBQUUsU0FBUztTQUNmLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRDs7T0FFRztJQUNILFVBQVU7UUFDUixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUM7SUFDbkIsQ0FBQztJQUVEOztPQUVHO0lBQ0gsVUFBVSxDQUFDLE9BQXdDO1FBQ2pELElBQUksQ0FBQyxJQUFJLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUUsR0FBRyxPQUFPLEVBQUUsQ0FBQztJQUMzQyxDQUFDO0NBQ0Y7QUEzTkQsZ0RBMk5DIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgb3BlcmF0aW9uYWxEYXRhIGZyb20gJy4uL2NvbmZpZy9vcGVyYXRpb25hbC1kYXRhLmpzb24nO1xuXG5leHBvcnQgaW50ZXJmYWNlIE9wZXJhdGlvbmFsSG91cnMge1xuICBvcGVuOiBzdHJpbmc7XG4gIGNsb3NlOiBzdHJpbmc7XG4gIGlzMjRIb3VyczogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBMb2NhdGlvbkluZm8ge1xuICBuYW1lOiBzdHJpbmc7XG4gIGFkZHJlc3M6IHN0cmluZztcbiAgcGhvbmU6IHN0cmluZztcbiAgd2Vic2l0ZTogc3RyaW5nO1xuICBob3Vyczoge1xuICAgIG1vbmRheTogT3BlcmF0aW9uYWxIb3VycztcbiAgICB0dWVzZGF5OiBPcGVyYXRpb25hbEhvdXJzO1xuICAgIHdlZG5lc2RheTogT3BlcmF0aW9uYWxIb3VycztcbiAgICB0aHVyc2RheTogT3BlcmF0aW9uYWxIb3VycztcbiAgICBmcmlkYXk6IE9wZXJhdGlvbmFsSG91cnM7XG4gICAgc2F0dXJkYXk6IE9wZXJhdGlvbmFsSG91cnM7XG4gICAgc3VuZGF5OiBPcGVyYXRpb25hbEhvdXJzO1xuICAgIGhvbGlkYXlzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICB9O1xuICB0aW1lem9uZTogc3RyaW5nO1xuICBzcGVjaWFsTm90ZXM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1lbWJlcnNoaXAge1xuICBpZDogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG4gIHByaWNlOiBudW1iZXI7XG4gIGN1cnJlbmN5OiBzdHJpbmc7XG4gIGJpbGxpbmc6IHN0cmluZztcbiAgZmVhdHVyZXM6IHN0cmluZ1tdO1xuICByZXN0cmljdGlvbnM6IHN0cmluZ1tdO1xuICBwb3B1bGFyPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcm9tb3Rpb24ge1xuICBpZDogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIHN0YXJ0X2RhdGU6IHN0cmluZztcbiAgZW5kX2RhdGU6IHN0cmluZztcbiAgc3RhdHVzOiAnYWN0aXZlJyB8ICdzY2hlZHVsZWQnIHwgJ2V4cGlyZWQnO1xuICBiZW5lZml0czogc3RyaW5nW107XG4gIGFwcGxpZXNfdG86IHN0cmluZ1tdO1xuICB0ZXJtczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgT3BlcmF0aW9uYWxDb250ZXh0IHtcbiAgY3VycmVudERhdGU/OiBEYXRlO1xuICBsb2NhdGlvbklkPzogc3RyaW5nO1xuICB0aW1lem9uZT86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIE9wZXJhdGlvbmFsU2VydmljZSB7XG4gIHByaXZhdGUgZGF0YTogdHlwZW9mIG9wZXJhdGlvbmFsRGF0YTtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLmRhdGEgPSBvcGVyYXRpb25hbERhdGE7XG4gIH1cblxuICAvKipcbiAgICogR2V0IGN1cnJlbnQgb3BlcmF0aW9uYWwgaG91cnMgZm9yIGEgbG9jYXRpb25cbiAgICovXG4gIGdldEN1cnJlbnRIb3Vycyhjb250ZXh0OiBPcGVyYXRpb25hbENvbnRleHQgPSB7fSk6IHtcbiAgICBpc09wZW46IGJvb2xlYW47XG4gICAgaG91cnM6IE9wZXJhdGlvbmFsSG91cnMgfCBudWxsO1xuICAgIG5leHRDaGFuZ2U6IHN0cmluZztcbiAgICBzcGVjaWFsTm90ZT86IHN0cmluZztcbiAgfSB7XG4gICAgY29uc3QgbG9jYXRpb25JZCA9IGNvbnRleHQubG9jYXRpb25JZCB8fCAnZGVmYXVsdCc7XG4gICAgY29uc3QgbG9jYXRpb24gPSB0aGlzLmRhdGEubG9jYXRpb25zW2xvY2F0aW9uSWQgYXMga2V5b2YgdHlwZW9mIHRoaXMuZGF0YS5sb2NhdGlvbnNdO1xuICAgIGNvbnN0IG5vdyA9IGNvbnRleHQuY3VycmVudERhdGUgfHwgbmV3IERhdGUoKTtcbiAgICBcbiAgICBpZiAoIWxvY2F0aW9uKSB7XG4gICAgICByZXR1cm4geyBpc09wZW46IGZhbHNlLCBob3VyczogbnVsbCwgbmV4dENoYW5nZTogJ1Vua25vd24gbG9jYXRpb24nIH07XG4gICAgfVxuXG4gICAgY29uc3QgZGF5TmFtZSA9IG5vdy50b0xvY2FsZURhdGVTdHJpbmcoJ2VuLVVTJywgeyB3ZWVrZGF5OiAnbG9uZycgfSkudG9Mb3dlckNhc2UoKSBhcyBrZXlvZiB0eXBlb2YgbG9jYXRpb24uaG91cnM7XG4gICAgY29uc3QgaG91cnMgPSBsb2NhdGlvbi5ob3Vyc1tkYXlOYW1lXSBhcyBPcGVyYXRpb25hbEhvdXJzO1xuICAgIFxuICAgIGlmICghaG91cnMpIHtcbiAgICAgIHJldHVybiB7IGlzT3BlbjogZmFsc2UsIGhvdXJzOiBudWxsLCBuZXh0Q2hhbmdlOiAnSG91cnMgbm90IGF2YWlsYWJsZScgfTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiBpdCdzIDI0IGhvdXJzXG4gICAgaWYgKGhvdXJzLmlzMjRIb3Vycykge1xuICAgICAgcmV0dXJuIHsgXG4gICAgICAgIGlzT3BlbjogdHJ1ZSwgXG4gICAgICAgIGhvdXJzLCBcbiAgICAgICAgbmV4dENoYW5nZTogJ09wZW4gMjQgaG91cnMnLFxuICAgICAgICBzcGVjaWFsTm90ZTogJ1RoaXMgbG9jYXRpb24gaXMgb3BlbiAyNC83J1xuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBQYXJzZSBjdXJyZW50IHRpbWUgYW5kIG9wZXJhdGluZyBob3Vyc1xuICAgIGNvbnN0IGN1cnJlbnRUaW1lID0gbm93LnRvVGltZVN0cmluZygpLnNsaWNlKDAsIDUpOyAvLyBISDpNTSBmb3JtYXRcbiAgICBjb25zdCBpc09wZW4gPSBjdXJyZW50VGltZSA+PSBob3Vycy5vcGVuICYmIGN1cnJlbnRUaW1lIDw9IGhvdXJzLmNsb3NlO1xuICAgIFxuICAgIGNvbnN0IG5leHRDaGFuZ2UgPSBpc09wZW4gXG4gICAgICA/IGBDbG9zZXMgYXQgJHt0aGlzLmZvcm1hdFRpbWUoaG91cnMuY2xvc2UpfWBcbiAgICAgIDogYE9wZW5zIGF0ICR7dGhpcy5mb3JtYXRUaW1lKGhvdXJzLm9wZW4pfWA7XG5cbiAgICByZXR1cm4geyBpc09wZW4sIGhvdXJzLCBuZXh0Q2hhbmdlIH07XG4gIH1cblxuICAvKipcbiAgICogR2V0IGN1cnJlbnQgcHJpY2luZyBpbmZvcm1hdGlvblxuICAgKi9cbiAgZ2V0Q3VycmVudFByaWNpbmcoKToge1xuICAgIG1lbWJlcnNoaXBzOiBNZW1iZXJzaGlwW107XG4gICAgZmVlczogYW55W107XG4gICAgYWN0aXZlUHJvbW90aW9uczogUHJvbW90aW9uW107XG4gIH0ge1xuICAgIGNvbnN0IGFjdGl2ZVByb21vdGlvbnMgPSB0aGlzLmdldEFjdGl2ZVByb21vdGlvbnMoKTtcbiAgICBcbiAgICByZXR1cm4ge1xuICAgICAgbWVtYmVyc2hpcHM6IHRoaXMuZGF0YS5wcmljaW5nLm1lbWJlcnNoaXBzLFxuICAgICAgZmVlczogdGhpcy5kYXRhLnByaWNpbmcuZmVlcyxcbiAgICAgIGFjdGl2ZVByb21vdGlvbnNcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBhY3RpdmUgcHJvbW90aW9ucyBiYXNlZCBvbiBjdXJyZW50IGRhdGVcbiAgICovXG4gIGdldEFjdGl2ZVByb21vdGlvbnMoY29udGV4dDogT3BlcmF0aW9uYWxDb250ZXh0ID0ge30pOiBQcm9tb3Rpb25bXSB7XG4gICAgY29uc3Qgbm93ID0gY29udGV4dC5jdXJyZW50RGF0ZSB8fCBuZXcgRGF0ZSgpO1xuICAgIGNvbnN0IGN1cnJlbnREYXRlU3RyID0gbm93LnRvSVNPU3RyaW5nKCkuc3BsaXQoJ1QnKVswXTsgLy8gWVlZWS1NTS1ERCBmb3JtYXRcbiAgICBcbiAgICByZXR1cm4gdGhpcy5kYXRhLnByb21vdGlvbnMuYWN0aXZlX3NhbGVzLmZpbHRlcihwcm9tbyA9PiB7XG4gICAgICBpZiAoKHByb21vIGFzIGFueSkuc3RhdHVzICE9PSAnYWN0aXZlJykgcmV0dXJuIGZhbHNlO1xuICAgICAgXG4gICAgICBjb25zdCBzdGFydERhdGUgPSBuZXcgRGF0ZShwcm9tby5zdGFydF9kYXRlKTtcbiAgICAgIGNvbnN0IGVuZERhdGUgPSBuZXcgRGF0ZShwcm9tby5lbmRfZGF0ZSk7XG4gICAgICBjb25zdCBjdXJyZW50RGF0ZSA9IG5ldyBEYXRlKGN1cnJlbnREYXRlU3RyKTtcbiAgICAgIFxuICAgICAgcmV0dXJuIGN1cnJlbnREYXRlID49IHN0YXJ0RGF0ZSAmJiBjdXJyZW50RGF0ZSA8PSBlbmREYXRlO1xuICAgIH0pIGFzIFByb21vdGlvbltdO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBtZW1iZXJzaGlwIGRldGFpbHMgYnkgSURcbiAgICovXG4gIGdldE1lbWJlcnNoaXAobWVtYmVyc2hpcElkOiBzdHJpbmcpOiBNZW1iZXJzaGlwIHwgbnVsbCB7XG4gICAgcmV0dXJuIHRoaXMuZGF0YS5wcmljaW5nLm1lbWJlcnNoaXBzLmZpbmQobSA9PiBtLmlkID09PSBtZW1iZXJzaGlwSWQpIHx8IG51bGw7XG4gIH1cblxuICAvKipcbiAgICogR2V0IGZvcm1hdHRlZCBwcmljaW5nIGluZm9ybWF0aW9uIGZvciBhIG1lbWJlcnNoaXBcbiAgICovXG4gIGdldEZvcm1hdHRlZFByaWNpbmcobWVtYmVyc2hpcElkOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IG1lbWJlcnNoaXAgPSB0aGlzLmdldE1lbWJlcnNoaXAobWVtYmVyc2hpcElkKTtcbiAgICBpZiAoIW1lbWJlcnNoaXApIHJldHVybiAnTWVtYmVyc2hpcCBub3QgZm91bmQnO1xuXG4gICAgY29uc3QgYWN0aXZlUHJvbW90aW9ucyA9IHRoaXMuZ2V0QWN0aXZlUHJvbW90aW9ucygpO1xuICAgIGNvbnN0IGFwcGxpY2FibGVQcm9tb3MgPSBhY3RpdmVQcm9tb3Rpb25zLmZpbHRlcihwID0+IFxuICAgICAgcC5hcHBsaWVzX3RvLmluY2x1ZGVzKG1lbWJlcnNoaXBJZClcbiAgICApO1xuXG4gICAgbGV0IHByaWNpbmcgPSBgJHttZW1iZXJzaGlwLm5hbWV9OiAkJHttZW1iZXJzaGlwLnByaWNlfS8ke21lbWJlcnNoaXAuYmlsbGluZ31gO1xuICAgIFxuICAgIGlmIChhcHBsaWNhYmxlUHJvbW9zLmxlbmd0aCA+IDApIHtcbiAgICAgIHByaWNpbmcgKz0gJ1xcblxcbvCfjokgQ3VycmVudCBQcm9tb3Rpb25zOic7XG4gICAgICBhcHBsaWNhYmxlUHJvbW9zLmZvckVhY2gocHJvbW8gPT4ge1xuICAgICAgICBwcmljaW5nICs9IGBcXG7igKIgJHtwcm9tby5uYW1lfTogJHtwcm9tby5kZXNjcmlwdGlvbn1gO1xuICAgICAgICBwcmljaW5nICs9IGBcXG4gIFZhbGlkIHVudGlsICR7dGhpcy5mb3JtYXREYXRlKHByb21vLmVuZF9kYXRlKX1gO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHByaWNpbmc7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHNlcnZpY2VzIGFuZCBhbWVuaXRpZXMgaW5mb3JtYXRpb25cbiAgICovXG4gIGdldFNlcnZpY2VzKCk6IHR5cGVvZiBvcGVyYXRpb25hbERhdGEuc2VydmljZXMge1xuICAgIHJldHVybiB0aGlzLmRhdGEuc2VydmljZXM7XG4gIH1cblxuICAvKipcbiAgICogR2V0IGNvbnRhY3QgaW5mb3JtYXRpb25cbiAgICovXG4gIGdldENvbnRhY3RJbmZvKCk6IHR5cGVvZiBvcGVyYXRpb25hbERhdGEuY29udGFjdCB7XG4gICAgcmV0dXJuIHRoaXMuZGF0YS5jb250YWN0O1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBwb2xpY2llcyBpbmZvcm1hdGlvblxuICAgKi9cbiAgZ2V0UG9saWNpZXMoKTogdHlwZW9mIG9wZXJhdGlvbmFsRGF0YS5wb2xpY2llcyB7XG4gICAgcmV0dXJuIHRoaXMuZGF0YS5wb2xpY2llcztcbiAgfVxuXG4gIC8qKlxuICAgKiBTZWFyY2ggZm9yIGluZm9ybWF0aW9uIGJhc2VkIG9uIHF1ZXJ5XG4gICAqL1xuICBzZWFyY2hPcGVyYXRpb25hbEluZm8ocXVlcnk6IHN0cmluZyk6IHtcbiAgICB0eXBlOiBzdHJpbmc7XG4gICAgZGF0YTogYW55O1xuICAgIHJlbGV2YW5jZTogbnVtYmVyO1xuICB9W10ge1xuICAgIGNvbnN0IHJlc3VsdHM6IHsgdHlwZTogc3RyaW5nOyBkYXRhOiBhbnk7IHJlbGV2YW5jZTogbnVtYmVyIH1bXSA9IFtdO1xuICAgIGNvbnN0IHF1ZXJ5TG93ZXIgPSBxdWVyeS50b0xvd2VyQ2FzZSgpO1xuXG4gICAgLy8gU2VhcmNoIGluIG1lbWJlcnNoaXBzXG4gICAgdGhpcy5kYXRhLnByaWNpbmcubWVtYmVyc2hpcHMuZm9yRWFjaChtZW1iZXJzaGlwID0+IHtcbiAgICAgIGxldCByZWxldmFuY2UgPSAwO1xuICAgICAgaWYgKG1lbWJlcnNoaXAubmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHF1ZXJ5TG93ZXIpKSByZWxldmFuY2UgKz0gMztcbiAgICAgIGlmIChtZW1iZXJzaGlwLmZlYXR1cmVzLnNvbWUoZiA9PiBmLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocXVlcnlMb3dlcikpKSByZWxldmFuY2UgKz0gMjtcbiAgICAgIGlmIChyZWxldmFuY2UgPiAwKSB7XG4gICAgICAgIHJlc3VsdHMucHVzaCh7IHR5cGU6ICdtZW1iZXJzaGlwJywgZGF0YTogbWVtYmVyc2hpcCwgcmVsZXZhbmNlIH0pO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gU2VhcmNoIGluIHByb21vdGlvbnNcbiAgICBjb25zdCBhY3RpdmVQcm9tb3Rpb25zID0gdGhpcy5nZXRBY3RpdmVQcm9tb3Rpb25zKCk7XG4gICAgYWN0aXZlUHJvbW90aW9ucy5mb3JFYWNoKHByb21vID0+IHtcbiAgICAgIGxldCByZWxldmFuY2UgPSAwO1xuICAgICAgaWYgKHByb21vLm5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeUxvd2VyKSkgcmVsZXZhbmNlICs9IDM7XG4gICAgICBpZiAocHJvbW8uZGVzY3JpcHRpb24udG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeUxvd2VyKSkgcmVsZXZhbmNlICs9IDI7XG4gICAgICBpZiAocHJvbW8uYmVuZWZpdHMuc29tZShiID0+IGIudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeUxvd2VyKSkpIHJlbGV2YW5jZSArPSAxO1xuICAgICAgaWYgKHJlbGV2YW5jZSA+IDApIHtcbiAgICAgICAgcmVzdWx0cy5wdXNoKHsgdHlwZTogJ3Byb21vdGlvbicsIGRhdGE6IHByb21vLCByZWxldmFuY2UgfSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBTZWFyY2ggaW4gc2VydmljZXNcbiAgICBPYmplY3QuZW50cmllcyh0aGlzLmRhdGEuc2VydmljZXMpLmZvckVhY2goKFtzZXJ2aWNlS2V5LCBzZXJ2aWNlXSkgPT4ge1xuICAgICAgaWYgKHNlcnZpY2VLZXkudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeUxvd2VyKSkge1xuICAgICAgICByZXN1bHRzLnB1c2goeyB0eXBlOiAnc2VydmljZScsIGRhdGE6IHsga2V5OiBzZXJ2aWNlS2V5LCAuLi4oc2VydmljZSBhcyBhbnkpIH0sIHJlbGV2YW5jZTogMiB9KTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiByZXN1bHRzLnNvcnQoKGEsIGIpID0+IGIucmVsZXZhbmNlIC0gYS5yZWxldmFuY2UpO1xuICB9XG5cbiAgLyoqXG4gICAqIEZvcm1hdCB0aW1lIGZvciBkaXNwbGF5XG4gICAqL1xuICBwcml2YXRlIGZvcm1hdFRpbWUodGltZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCBbaG91cnMsIG1pbnV0ZXNdID0gdGltZS5zcGxpdCgnOicpO1xuICAgIGNvbnN0IGhvdXIgPSBwYXJzZUludChob3Vycyk7XG4gICAgY29uc3QgYW1wbSA9IGhvdXIgPj0gMTIgPyAnUE0nIDogJ0FNJztcbiAgICBjb25zdCBkaXNwbGF5SG91ciA9IGhvdXIgPiAxMiA/IGhvdXIgLSAxMiA6IGhvdXIgPT09IDAgPyAxMiA6IGhvdXI7XG4gICAgcmV0dXJuIGAke2Rpc3BsYXlIb3VyfToke21pbnV0ZXN9ICR7YW1wbX1gO1xuICB9XG5cbiAgLyoqXG4gICAqIEZvcm1hdCBkYXRlIGZvciBkaXNwbGF5XG4gICAqL1xuICBwcml2YXRlIGZvcm1hdERhdGUoZGF0ZVN0cjogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCBkYXRlID0gbmV3IERhdGUoZGF0ZVN0cik7XG4gICAgcmV0dXJuIGRhdGUudG9Mb2NhbGVEYXRlU3RyaW5nKCdlbi1VUycsIHsgXG4gICAgICB5ZWFyOiAnbnVtZXJpYycsIFxuICAgICAgbW9udGg6ICdsb25nJywgXG4gICAgICBkYXk6ICdudW1lcmljJyBcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgYWxsIG9wZXJhdGlvbmFsIGRhdGEgKGZvciBhZG1pbi9kZWJ1Z2dpbmcpXG4gICAqL1xuICBnZXRBbGxEYXRhKCk6IHR5cGVvZiBvcGVyYXRpb25hbERhdGEge1xuICAgIHJldHVybiB0aGlzLmRhdGE7XG4gIH1cblxuICAvKipcbiAgICogVXBkYXRlIG9wZXJhdGlvbmFsIGRhdGEgKGZvciBmdXR1cmUgZHluYW1pYyB1cGRhdGVzKVxuICAgKi9cbiAgdXBkYXRlRGF0YSh1cGRhdGVzOiBQYXJ0aWFsPHR5cGVvZiBvcGVyYXRpb25hbERhdGE+KTogdm9pZCB7XG4gICAgdGhpcy5kYXRhID0geyAuLi50aGlzLmRhdGEsIC4uLnVwZGF0ZXMgfTtcbiAgfVxufVxuIl19
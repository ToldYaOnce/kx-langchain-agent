import * as operationalData from '../config/operational-data.json';

export interface OperationalHours {
  open: string;
  close: string;
  is24Hours: boolean;
}

export interface LocationInfo {
  name: string;
  address: string;
  phone: string;
  website: string;
  hours: {
    monday: OperationalHours;
    tuesday: OperationalHours;
    wednesday: OperationalHours;
    thursday: OperationalHours;
    friday: OperationalHours;
    saturday: OperationalHours;
    sunday: OperationalHours;
    holidays: Record<string, string>;
  };
  timezone: string;
  specialNotes: string[];
}

export interface Membership {
  id: string;
  name: string;
  price: number;
  currency: string;
  billing: string;
  features: string[];
  restrictions: string[];
  popular?: boolean;
}

export interface Promotion {
  id: string;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'scheduled' | 'expired';
  benefits: string[];
  applies_to: string[];
  terms: string[];
}

export interface OperationalContext {
  currentDate?: Date;
  locationId?: string;
  timezone?: string;
}

export class OperationalService {
  private data: typeof operationalData;

  constructor() {
    this.data = operationalData;
  }

  /**
   * Get current operational hours for a location
   */
  getCurrentHours(context: OperationalContext = {}): {
    isOpen: boolean;
    hours: OperationalHours | null;
    nextChange: string;
    specialNote?: string;
  } {
    const locationId = context.locationId || 'default';
    const location = this.data.locations[locationId as keyof typeof this.data.locations];
    const now = context.currentDate || new Date();
    
    if (!location) {
      return { isOpen: false, hours: null, nextChange: 'Unknown location' };
    }

    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() as keyof typeof location.hours;
    const hours = location.hours[dayName] as OperationalHours;
    
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
  getCurrentPricing(): {
    memberships: Membership[];
    fees: any[];
    activePromotions: Promotion[];
  } {
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
  getActivePromotions(context: OperationalContext = {}): Promotion[] {
    const now = context.currentDate || new Date();
    const currentDateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    return this.data.promotions.active_sales.filter(promo => {
      if ((promo as any).status !== 'active') return false;
      
      const startDate = new Date(promo.start_date);
      const endDate = new Date(promo.end_date);
      const currentDate = new Date(currentDateStr);
      
      return currentDate >= startDate && currentDate <= endDate;
    }) as Promotion[];
  }

  /**
   * Get membership details by ID
   */
  getMembership(membershipId: string): Membership | null {
    return this.data.pricing.memberships.find(m => m.id === membershipId) || null;
  }

  /**
   * Get formatted pricing information for a membership
   */
  getFormattedPricing(membershipId: string): string {
    const membership = this.getMembership(membershipId);
    if (!membership) return 'Membership not found';

    const activePromotions = this.getActivePromotions();
    const applicablePromos = activePromotions.filter(p => 
      p.applies_to.includes(membershipId)
    );

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
  getServices(): typeof operationalData.services {
    return this.data.services;
  }

  /**
   * Get contact information
   */
  getContactInfo(): typeof operationalData.contact {
    return this.data.contact;
  }

  /**
   * Get policies information
   */
  getPolicies(): typeof operationalData.policies {
    return this.data.policies;
  }

  /**
   * Search for information based on query
   */
  searchOperationalInfo(query: string): {
    type: string;
    data: any;
    relevance: number;
  }[] {
    const results: { type: string; data: any; relevance: number }[] = [];
    const queryLower = query.toLowerCase();

    // Search in memberships
    this.data.pricing.memberships.forEach(membership => {
      let relevance = 0;
      if (membership.name.toLowerCase().includes(queryLower)) relevance += 3;
      if (membership.features.some(f => f.toLowerCase().includes(queryLower))) relevance += 2;
      if (relevance > 0) {
        results.push({ type: 'membership', data: membership, relevance });
      }
    });

    // Search in promotions
    const activePromotions = this.getActivePromotions();
    activePromotions.forEach(promo => {
      let relevance = 0;
      if (promo.name.toLowerCase().includes(queryLower)) relevance += 3;
      if (promo.description.toLowerCase().includes(queryLower)) relevance += 2;
      if (promo.benefits.some(b => b.toLowerCase().includes(queryLower))) relevance += 1;
      if (relevance > 0) {
        results.push({ type: 'promotion', data: promo, relevance });
      }
    });

    // Search in services
    Object.entries(this.data.services).forEach(([serviceKey, service]) => {
      if (serviceKey.toLowerCase().includes(queryLower)) {
        results.push({ type: 'service', data: { key: serviceKey, ...(service as any) }, relevance: 2 });
      }
    });

    return results.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Format time for display
   */
  private formatTime(time: string): string {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  }

  /**
   * Format date for display
   */
  private formatDate(dateStr: string): string {
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
  getAllData(): typeof operationalData {
    return this.data;
  }

  /**
   * Update operational data (for future dynamic updates)
   */
  updateData(updates: Partial<typeof operationalData>): void {
    this.data = { ...this.data, ...updates };
  }
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonaApiLoader = void 0;
exports.createPersonaApiLoader = createPersonaApiLoader;
class PersonaApiLoader {
    constructor(config) {
        this.config = {
            timeout: 5000,
            ...config,
        };
    }
    /**
     * Load company persona data from the new API structure
     * This replaces the old personas.json loading
     */
    async loadCompanyPersona(tenantId, personaId) {
        const url = personaId
            ? `${this.config.baseUrl}/company-persona/${tenantId}/${personaId}`
            : `${this.config.baseUrl}/company-persona/${tenantId}`;
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.config.headers,
                },
                signal: AbortSignal.timeout(this.config.timeout),
            });
            if (!response.ok) {
                throw new Error(`Failed to load persona: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            return data;
        }
        catch (error) {
            console.error('Error loading company persona:', error);
            throw new Error(`Failed to load persona for tenant ${tenantId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Load random company persona
     */
    async loadRandomCompanyPersona(tenantId) {
        return this.loadCompanyPersona(tenantId); // No personaId = random
    }
    /**
     * Get available personas for a tenant
     */
    async getAvailablePersonas(tenantId) {
        const url = `${this.config.baseUrl}/company-persona/${tenantId}/personas/list`;
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.config.headers,
                },
                signal: AbortSignal.timeout(this.config.timeout),
            });
            if (!response.ok) {
                throw new Error(`Failed to load available personas: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            return data.availablePersonas || [];
        }
        catch (error) {
            console.error('Error loading available personas:', error);
            throw new Error(`Failed to load available personas for tenant ${tenantId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Convert the new API response to the legacy AgentPersona format
     * This helps with backward compatibility during transition
     */
    convertToLegacyFormat(companyPersona) {
        return {
            name: companyPersona.persona.name,
            description: companyPersona.persona.description || '',
            systemPrompt: 'You are a helpful assistant', // Default system prompt since PersonalityConfig doesn't have systemPrompt
            personality: companyPersona.persona.personality,
            responseGuidelines: companyPersona.persona.responseGuidelines || [],
            greetings: companyPersona.compiledPersona.greetings || companyPersona.persona.greetings,
            responseChunking: companyPersona.persona.responseChunking,
            goalConfiguration: companyPersona.persona.goalConfiguration,
            actionTags: companyPersona.persona.actionTags,
            metadata: companyPersona.persona.metadata || {},
            // Company-level data
            companyInfo: companyPersona.companyInfo,
            intentCapturing: companyPersona.companyInfo.intentCapturing, // Now at company level
        };
    }
}
exports.PersonaApiLoader = PersonaApiLoader;
/**
 * Factory function to create a PersonaApiLoader with environment-based config
 */
function createPersonaApiLoader(overrides) {
    const config = {
        baseUrl: process.env.MANAGEMENT_API_URL || 'http://localhost:3000',
        timeout: parseInt(process.env.API_TIMEOUT || '5000'),
        headers: process.env.API_AUTH_TOKEN ? {
            'Authorization': `Bearer ${process.env.API_AUTH_TOKEN}`,
        } : {},
        ...overrides,
    };
    // Remove undefined headers
    if (config.headers) {
        Object.keys(config.headers).forEach(key => {
            if (config.headers[key] === undefined) {
                delete config.headers[key];
            }
        });
    }
    return new PersonaApiLoader(config);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGVyc29uYS1hcGktbG9hZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2xpYi9wZXJzb25hLWFwaS1sb2FkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBOEdBLHdEQW9CQztBQTFIRCxNQUFhLGdCQUFnQjtJQUczQixZQUFZLE1BQXdCO1FBQ2xDLElBQUksQ0FBQyxNQUFNLEdBQUc7WUFDWixPQUFPLEVBQUUsSUFBSTtZQUNiLEdBQUcsTUFBTTtTQUNWLENBQUM7SUFDSixDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsS0FBSyxDQUFDLGtCQUFrQixDQUFDLFFBQWdCLEVBQUUsU0FBa0I7UUFDM0QsTUFBTSxHQUFHLEdBQUcsU0FBUztZQUNuQixDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sb0JBQW9CLFFBQVEsSUFBSSxTQUFTLEVBQUU7WUFDbkUsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLG9CQUFvQixRQUFRLEVBQUUsQ0FBQztRQUV6RCxJQUFJLENBQUM7WUFDSCxNQUFNLFFBQVEsR0FBRyxNQUFNLEtBQUssQ0FBQyxHQUFHLEVBQUU7Z0JBQ2hDLE1BQU0sRUFBRSxLQUFLO2dCQUNiLE9BQU8sRUFBRTtvQkFDUCxjQUFjLEVBQUUsa0JBQWtCO29CQUNsQyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTztpQkFDdkI7Z0JBQ0QsTUFBTSxFQUFFLFdBQVcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFRLENBQUM7YUFDbEQsQ0FBQyxDQUFDO1lBRUgsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDakIsTUFBTSxJQUFJLEtBQUssQ0FBQywyQkFBMkIsUUFBUSxDQUFDLE1BQU0sSUFBSSxRQUFRLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztZQUN2RixDQUFDO1lBRUQsTUFBTSxJQUFJLEdBQUcsTUFBTSxRQUFR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QWMsQ0FBQyxXQUFXLENBQUMsZUFBZSxFQUFFLHVCQUF1QjtTQUNyRixDQUFDO0lBQ0osQ0FBQztDQUNGO0FBakdELDRDQWlHQztBQUVEOztHQUVHO0FBQ0gsU0FBZ0Isc0JBQXNCLENBQUMsU0FBcUM7SUFDMUUsTUFBTSxNQUFNLEdBQXFCO1FBQy9CLE9BQU8sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixJQUFJLHVCQUF1QjtRQUNsRSxPQUFPLEVBQUUsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxJQUFJLE1BQU0sQ0FBQztRQUNwRCxPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO1lBQ3BDLGVBQWUsRUFBRSxVQUFVLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxFQUFFO1NBQ3hELENBQUMsQ0FBQyxDQUFDLEVBQUU7UUFDTixHQUFHLFNBQVM7S0FDYixDQUFDO0lBRUYsMkJBQTJCO0lBQzNCLElBQUksTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25CLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRTtZQUN4QyxJQUFJLE1BQU0sQ0FBQyxPQUFRLENBQUMsR0FBRyxDQUFDLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQ3ZDLE9BQU8sTUFBTSxDQUFDLE9BQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUM5QixDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBTyxJQUFJLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ3RDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb21wYW55UGVyc29uYVJlc3BvbnNlIH0gZnJvbSAnLi4vc2VydmljZXMvY29tcGFueS1wZXJzb25hLXNlcnZpY2UuanMnO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBQZXJzb25hQXBpQ29uZmlnIHtcclxuICBiYXNlVXJsOiBzdHJpbmc7XHJcbiAgdGltZW91dD86IG51bWJlcjtcclxuICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIFBlcnNvbmFBcGlMb2FkZXIge1xyXG4gIHByaXZhdGUgY29uZmlnOiBQZXJzb25hQXBpQ29uZmlnO1xyXG5cclxuICBjb25zdHJ1Y3Rvcihjb25maWc6IFBlcnNvbmFBcGlDb25maWcpIHtcclxuICAgIHRoaXMuY29uZmlnID0ge1xyXG4gICAgICB0aW1lb3V0OiA1MDAwLFxyXG4gICAgICAuLi5jb25maWcsXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogTG9hZCBjb21wYW55IHBlcnNvbmEgZGF0YSBmcm9tIHRoZSBuZXcgQVBJIHN0cnVjdHVyZVxyXG4gICAqIFRoaXMgcmVwbGFjZXMgdGhlIG9sZCBwZXJzb25hcy5qc29uIGxvYWRpbmdcclxuICAgKi9cclxuICBhc3luYyBsb2FkQ29tcGFueVBlcnNvbmEodGVuYW50SWQ6IHN0cmluZywgcGVyc29uYUlkPzogc3RyaW5nKTogUHJvbWlzZTxDb21wYW55UGVyc29uYVJlc3BvbnNlPiB7XHJcbiAgICBjb25zdCB1cmwgPSBwZXJzb25hSWQgXHJcbiAgICAgID8gYCR7dGhpcy5jb25maWcuYmFzZVVybH0vY29tcGFueS1wZXJzb25hLyR7dGVuYW50SWR9LyR7cGVyc29uYUlkfWBcclxuICAgICAgOiBgJHt0aGlzLmNvbmZpZy5iYXNlVXJsfS9jb21wYW55LXBlcnNvbmEvJHt0ZW5hbnRJZH1gO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCB7XHJcbiAgICAgICAgbWV0aG9kOiAnR0VUJyxcclxuICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICAgLi4udGhpcy5jb25maWcuaGVhZGVycyxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCh0aGlzLmNvbmZpZy50aW1lb3V0ISksXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGxvYWQgcGVyc29uYTogJHtyZXNwb25zZS5zdGF0dXN9ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKSBhcyBDb21wYW55UGVyc29uYVJlc3BvbnNlO1xyXG4gICAgICByZXR1cm4gZGF0YTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGxvYWRpbmcgY29tcGFueSBwZXJzb25hOicsIGVycm9yKTtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gbG9hZCBwZXJzb25hIGZvciB0ZW5hbnQgJHt0ZW5hbnRJZH06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBMb2FkIHJhbmRvbSBjb21wYW55IHBlcnNvbmFcclxuICAgKi9cclxuICBhc3luYyBsb2FkUmFuZG9tQ29tcGFueVBlcnNvbmEodGVuYW50SWQ6IHN0cmluZyk6IFByb21pc2U8Q29tcGFueVBlcnNvbmFSZXNwb25zZT4ge1xyXG4gICAgcmV0dXJuIHRoaXMubG9hZENvbXBhbnlQZXJzb25hKHRlbmFudElkKTsgLy8gTm8gcGVyc29uYUlkID0gcmFuZG9tXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXQgYXZhaWxhYmxlIHBlcnNvbmFzIGZvciBhIHRlbmFudFxyXG4gICAqL1xyXG4gIGFzeW5jIGdldEF2YWlsYWJsZVBlcnNvbmFzKHRlbmFudElkOiBzdHJpbmcpOiBQcm9taXNlPEFycmF5PHsgcGVyc29uYUlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZzsgZGVzY3JpcHRpb246IHN0cmluZyB9Pj4ge1xyXG4gICAgY29uc3QgdXJsID0gYCR7dGhpcy5jb25maWcuYmFzZVVybH0vY29tcGFueS1wZXJzb25hLyR7dGVuYW50SWR9L3BlcnNvbmFzL2xpc3RgO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCB7XHJcbiAgICAgICAgbWV0aG9kOiAnR0VUJyxcclxuICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICAgICAgLi4udGhpcy5jb25maWcuaGVhZGVycyxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCh0aGlzLmNvbmZpZy50aW1lb3V0ISksXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGxvYWQgYXZhaWxhYmxlIHBlcnNvbmFzOiAke3Jlc3BvbnNlLnN0YXR1c30gJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpIGFzIHsgYXZhaWxhYmxlUGVyc29uYXM6IEFycmF5PHsgcGVyc29uYUlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZzsgZGVzY3JpcHRpb246IHN0cmluZyB9PiB9O1xyXG4gICAgICByZXR1cm4gZGF0YS5hdmFpbGFibGVQZXJzb25hcyB8fCBbXTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGxvYWRpbmcgYXZhaWxhYmxlIHBlcnNvbmFzOicsIGVycm9yKTtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gbG9hZCBhdmFpbGFibGUgcGVyc29uYXMgZm9yIHRlbmFudCAke3RlbmFudElkfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ31gKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENvbnZlcnQgdGhlIG5ldyBBUEkgcmVzcG9uc2UgdG8gdGhlIGxlZ2FjeSBBZ2VudFBlcnNvbmEgZm9ybWF0XHJcbiAgICogVGhpcyBoZWxwcyB3aXRoIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkgZHVyaW5nIHRyYW5zaXRpb25cclxuICAgKi9cclxuICBjb252ZXJ0VG9MZWdhY3lGb3JtYXQoY29tcGFueVBlcnNvbmE6IENvbXBhbnlQZXJzb25hUmVzcG9uc2UpOiBhbnkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgbmFtZTogY29tcGFueVBlcnNvbmEucGVyc29uYS5uYW1lLFxyXG4gICAgICBkZXNjcmlwdGlvbjogY29tcGFueVBlcnNvbmEucGVyc29uYS5kZXNjcmlwdGlvbiB8fCAnJyxcclxuICAgICAgc3lzdGVtUHJvbXB0OiAnWW91IGFyZSBhIGhlbHBmdWwgYXNzaXN0YW50JywgLy8gRGVmYXVsdCBzeXN0ZW0gcHJvbXB0IHNpbmNlIFBlcnNvbmFsaXR5Q29uZmlnIGRvZXNuJ3QgaGF2ZSBzeXN0ZW1Qcm9tcHRcclxuICAgICAgcGVyc29uYWxpdHk6IGNvbXBhbnlQZXJzb25hLnBlcnNvbmEucGVyc29uYWxpdHksXHJcbiAgICAgIHJlc3BvbnNlR3VpZGVsaW5lczogY29tcGFueVBlcnNvbmEucGVyc29uYS5yZXNwb25zZUd1aWRlbGluZXMgfHwgW10sXHJcbiAgICAgIGdyZWV0aW5nczogY29tcGFueVBlcnNvbmEuY29tcGlsZWRQZXJzb25hLmdyZWV0aW5ncyB8fCBjb21wYW55UGVyc29uYS5wZXJzb25hLmdyZWV0aW5ncyxcclxuICAgICAgcmVzcG9uc2VDaHVua2luZzogY29tcGFueVBlcnNvbmEucGVyc29uYS5yZXNwb25zZUNodW5raW5nLFxyXG4gICAgICBnb2FsQ29uZmlndXJhdGlvbjogY29tcGFueVBlcnNvbmEucGVyc29uYS5nb2FsQ29uZmlndXJhdGlvbixcclxuICAgICAgYWN0aW9uVGFnczogY29tcGFueVBlcnNvbmEucGVyc29uYS5hY3Rpb25UYWdzLFxyXG4gICAgICBtZXRhZGF0YTogY29tcGFueVBlcnNvbmEucGVyc29uYS5tZXRhZGF0YSB8fCB7fSxcclxuICAgICAgLy8gQ29tcGFueS1sZXZlbCBkYXRhXHJcbiAgICAgIGNvbXBhbnlJbmZvOiBjb21wYW55UGVyc29uYS5jb21wYW55SW5mbyxcclxuICAgICAgaW50ZW50Q2FwdHVyaW5nOiBjb21wYW55UGVyc29uYS5jb21wYW55SW5mby5pbnRlbnRDYXB0dXJpbmcsIC8vIE5vdyBhdCBjb21wYW55IGxldmVsXHJcbiAgICB9O1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEZhY3RvcnkgZnVuY3Rpb24gdG8gY3JlYXRlIGEgUGVyc29uYUFwaUxvYWRlciB3aXRoIGVudmlyb25tZW50LWJhc2VkIGNvbmZpZ1xyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVBlcnNvbmFBcGlMb2FkZXIob3ZlcnJpZGVzPzogUGFydGlhbDxQZXJzb25hQXBpQ29uZmlnPik6IFBlcnNvbmFBcGlMb2FkZXIge1xyXG4gIGNvbnN0IGNvbmZpZzogUGVyc29uYUFwaUNvbmZpZyA9IHtcclxuICAgIGJhc2VVcmw6IHByb2Nlc3MuZW52Lk1BTkFHRU1FTlRfQVBJX1VSTCB8fCAnaHR0cDovL2xvY2FsaG9zdDozMDAwJyxcclxuICAgIHRpbWVvdXQ6IHBhcnNlSW50KHByb2Nlc3MuZW52LkFQSV9USU1FT1VUIHx8ICc1MDAwJyksXHJcbiAgICBoZWFkZXJzOiBwcm9jZXNzLmVudi5BUElfQVVUSF9UT0tFTiA/IHtcclxuICAgICAgJ0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7cHJvY2Vzcy5lbnYuQVBJX0FVVEhfVE9LRU59YCxcclxuICAgIH0gOiB7fSxcclxuICAgIC4uLm92ZXJyaWRlcyxcclxuICB9O1xyXG5cclxuICAvLyBSZW1vdmUgdW5kZWZpbmVkIGhlYWRlcnNcclxuICBpZiAoY29uZmlnLmhlYWRlcnMpIHtcclxuICAgIE9iamVjdC5rZXlzKGNvbmZpZy5oZWFkZXJzKS5mb3JFYWNoKGtleSA9PiB7XHJcbiAgICAgIGlmIChjb25maWcuaGVhZGVycyFba2V5XSA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgZGVsZXRlIGNvbmZpZy5oZWFkZXJzIVtrZXldO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIHJldHVybiBuZXcgUGVyc29uYUFwaUxvYWRlcihjb25maWcpO1xyXG59XHJcbiJdfQ==
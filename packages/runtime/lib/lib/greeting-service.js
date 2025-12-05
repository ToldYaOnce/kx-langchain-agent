"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GreetingService = void 0;
/**
 * Service for generating randomized persona greetings
 */
class GreetingService {
    /**
     * Generate a random greeting from the persona's greeting configuration
     */
    static generateGreeting(greetingConfig, companyInfo) {
        if (!greetingConfig || !greetingConfig.variations || greetingConfig.variations.length === 0) {
            return "Hello! How can I help you today?";
        }
        // Pick a random variation
        const randomIndex = Math.floor(Math.random() * greetingConfig.variations.length);
        let greeting = greetingConfig.variations[randomIndex];
        // Replace company placeholders
        if (companyInfo) {
            greeting = greeting
                .replace(/\{\{companyName\}\}/g, companyInfo.name || 'Planet Fitness1')
                .replace(/\{\{companyIndustry\}\}/g, companyInfo.industry || 'Big Box Gyms')
                .replace(/\{\{companyDescription\}\}/g, companyInfo.description || 'Planet Fitness2 is a global franchisor and operator of fitness centers known as a "Judgement Free Zone" for casual gym-goers')
                .replace(/\{\{companyProducts\}\}/g, companyInfo.products || 'Big fitness but also has apparrel, coffee, and a cafe')
                .replace(/\{\{companyBenefits\}\}/g, companyInfo.benefits || 'Only $10 a month')
                .replace(/\{\{companyTargetCustomers\}\}/g, companyInfo.targetCustomers || 'People who seek value')
                .replace(/\{\{companyDifferentiators\}\}/g, companyInfo.differentiators || 'Best prices');
        }
        else {
            // Default values
            greeting = greeting
                .replace(/\{\{companyName\}\}/g, 'Planet Fitness3')
                .replace(/\{\{companyIndustry\}\}/g, 'Big Box Gyms')
                .replace(/\{\{companyDescription\}\}/g, 'Planet Fitness4 is a global franchisor and operator of fitness centers known as a "Judgement Free Zone" for casual gym-goers')
                .replace(/\{\{companyProducts\}\}/g, 'Big fitness but also has apparrel, coffee, and a cafe')
                .replace(/\{\{companyBenefits\}\}/g, 'Only $10 a month')
                .replace(/\{\{companyTargetCustomers\}\}/g, 'People who seek value')
                .replace(/\{\{companyDifferentiators\}\}/g, 'Best prices');
        }
        return greeting;
    }
    /**
     * Get the greeting gist/description for a persona
     */
    static getGreetingGist(greetingConfig) {
        return greetingConfig?.gist || "Standard friendly greeting";
    }
    /**
     * Get all greeting variations for a persona (useful for testing/preview)
     */
    static getGreetingVariations(greetingConfig, companyInfo) {
        if (!greetingConfig || !greetingConfig.variations) {
            return ["Hello! How can I help you today?"];
        }
        return greetingConfig.variations.map(variation => {
            let greeting = variation;
            // Replace company placeholders
            if (companyInfo) {
                greeting = greeting
                    .replace(/\{\{companyName\}\}/g, companyInfo.name || 'Planet Fitness5')
                    .replace(/\{\{companyIndustry\}\}/g, companyInfo.industry || 'Big Box Gyms')
                    .replace(/\{\{companyDescription\}\}/g, companyInfo.description || 'Planet Fitness6 is a global franchisor and operator of fitness centers')
                    .replace(/\{\{companyProducts\}\}/g, companyInfo.products || 'Big fitness but also has apparrel, coffee, and a cafe')
                    .replace(/\{\{companyBenefits\}\}/g, companyInfo.benefits || 'Only $10 a month')
                    .replace(/\{\{companyTargetCustomers\}\}/g, companyInfo.targetCustomers || 'People who seek value')
                    .replace(/\{\{companyDifferentiators\}\}/g, companyInfo.differentiators || 'Best prices');
            }
            else {
                greeting = greeting
                    .replace(/\{\{companyName\}\}/g, 'Planet Fitness7')
                    .replace(/\{\{companyIndustry\}\}/g, 'Big Box Gyms')
                    .replace(/\{\{companyDescription\}\}/g, 'Planet Fitness8 is a global franchisor and operator of fitness centers')
                    .replace(/\{\{companyProducts\}\}/g, 'Big fitness but also has apparrel, coffee, and a cafe')
                    .replace(/\{\{companyBenefits\}\}/g, 'Only $10 a month')
                    .replace(/\{\{companyTargetCustomers\}\}/g, 'People who seek value')
                    .replace(/\{\{companyDifferentiators\}\}/g, 'Best prices');
            }
            return greeting;
        });
    }
}
exports.GreetingService = GreetingService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JlZXRpbmctc2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9saWIvZ3JlZXRpbmctc2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFHQTs7R0FFRztBQUNILE1BQWEsZUFBZTtJQUMxQjs7T0FFRztJQUNILE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxjQUErQixFQUFFLFdBQXlCO1FBQ2hGLElBQUksQ0FBQyxjQUFjLElBQUksQ0FBQyxjQUFjLENBQUMsVUFBVSxJQUFJLGNBQWMsQ0FBQyxVQUFVLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzVGLE9BQU8sa0NBQWtDLENBQUM7UUFDNUMsQ0FBQztRQUVELDBCQUEwQjtRQUMxQixNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxjQUFjLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2pGLElBQUksUUFBUSxHQUFHLGNBQWMsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFdEQsK0JBQStCO1FBQy9CLElBQUksV0FBVyxFQUFFLENBQUM7WUFDaEIsUUFBUSxHQUFHLFFBQVE7aUJBQ2hCLE9BQU8sQ0FBQyxzQkFBc0IsRUFBRSxXQUFXLENBQUMsSUFBSSxJQUFJLGlCQUFpQixDQUFDO2lCQUN0RSxPQUFPLENBQUMsMEJBQTBCLEVBQUUsV0FBVyxDQUFDLFFBQVEsSUFBSSxjQUFjLENBQUM7aUJBQzNFLE9BQU8sQ0FBQyw2QkFBNkIsRUFBRSxXQUFXLENBQUMsV0FBVyxJQUFJLDhIQUE4SCxDQUFDO2lCQUNqTSxPQUFPLENBQUMsMEJBQTBCLEVBQUUsV0FBVyxDQUFDLFFBQVEsSUFBSSx1REFBdUQsQ0FBQztpQkFDcEgsT0FBTyxDQUFDLDBCQUEwQixFQUFFLFdBQVcsQ0FBQyxRQUFRLElBQUksa0JBQWtCLENBQUM7aUJBQy9FLE9BQU8sQ0FBQyxpQ0FBaUMsRUFBRSxXQUFXLENBQUMsZUFBZSxJQUFJLHVCQUF1QixDQUFDO2lCQUNsRyxPQUFPLENBQUMsaUNBQWlDLEVBQUUsV0FBVyxDQUFDLGVBQWUsSUFBSSxhQUFhLENBQUMsQ0FBQztRQUM5RixDQUFDO2FBQU0sQ0FBQztZQUNOLGlCQUFpQjtZQUNqQixRQUFRLEdBQUcsUUFBUTtpQkFDaEIsT0FBTyxDQUFDLHNCQUFzQixFQUFFLGlCQUFpQixDQUFDO2lCQUNsRCxPQUFPLENBQUMsMEJBQTBCLEVBQUUsY0FBYyxDQUFDO2lCQUNuRCxPQUFPLENBQUMsNkJBQTZCLEVBQUUsOEhBQThILENBQUM7aUJBQ3RLLE9BQU8sQ0FBQywwQkFBMEIsRUFBRSx1REFBdUQsQ0FBQztpQkFDNUYsT0FBTyxDQUFDLDBCQUEwQixFQUFFLGtCQUFrQixDQUFDO2lCQUN2RCxPQUFPLENBQUMsaUNBQWlDLEVBQUUsdUJBQXVCLENBQUM7aUJBQ25FLE9BQU8sQ0FBQyxpQ0FBaUMsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUMvRCxDQUFDO1FBRUQsT0FBTyxRQUFRLENBQUM7SUFDbEIsQ0FBQztJQUVEOztPQUVHO0lBQ0gsTUFBTSxDQUFDLGVBQWUsQ0FBQyxjQUErQjtRQUNwRCxPQUFPLGNBQWMsRUFBRSxJQUFJLElBQUksNEJBQTRCLENBQUM7SUFDOUQsQ0FBQztJQUVEOztPQUVHO0lBQ0gsTUFBTSxDQUFDLHFCQUFxQixDQUFDLGNBQStCLEVBQUUsV0FBeUI7UUFDckYsSUFBSSxDQUFDLGNBQWMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNsRCxPQUFPLENBQUMsa0NBQWtDLENBQUMsQ0FBQztRQUM5QyxDQUFDO1FBRUQsT0FBTyxjQUFjLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsRUFBRTtZQUMvQyxJQUFJLFFBQVEsR0FBRyxTQUFTLENBQUM7WUFFekIsK0JBQStCO1lBQy9CLElBQUksV0FBVyxFQUFFLENBQUM7Z0JBQ2hCLFFBQVEsR0FBRyxRQUFRO3FCQUNoQixPQUFPLENBQUMsc0JBQXNCLEVBQUUsV0FBVyxDQUFDLElBQUksSUFBSSxpQkFBaUIsQ0FBQztxQkFDdEUsT0FBTyxDQUFDLDBCQUEwQixFQUFFLFdBQVcsQ0FBQyxRQUFRLElBQUksY0FBYyxDQUFDO3FCQUMzRSxPQUFPLENBQUMsNkJBQTZCLEVBQUUsV0FBVyxDQUFDLFdBQVcsSUFBSSx3RUFBd0UsQ0FBQztxQkFDM0ksT0FBTyxDQUFDLDBCQUEwQixFQUFFLFdBQVcsQ0FBQyxRQUFRLElBQUksdURBQXVELENBQUM7cUJBQ3BILE9BQU8sQ0FBQywwQkFBMEIsRUFBRSxXQUFXLENBQUMsUUFBUSxJQUFJLGtCQUFrQixDQUFDO3FCQUMvRSxPQUFPLENBQUMsaUNBQWlDLEVBQUUsV0FBVyxDQUFDLGVBQWUsSUFBSSx1QkFBdUIsQ0FBQztxQkFDbEcsT0FBTyxDQUFDLGlDQUFpQyxFQUFFLFdBQVcsQ0FBQyxlQUFlLElBQUksYUFBYSxDQUFDLENBQUM7WUFDOUYsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLFFBQVEsR0FBRyxRQUFRO3FCQUNoQixPQUFPLENBQUMsc0JBQXNCLEVBQUUsaUJBQWlCLENBQUM7cUJBQ2xELE9BQU8sQ0FBQywwQkFBMEIsRUFBRSxjQUFjLENBQUM7cUJBQ25ELE9BQU8sQ0FBQyw2QkFBNkIsRUFBRSx3RUFBd0UsQ0FBQztxQkFDaEgsT0FBTyxDQUFDLDBCQUEwQixFQUFFLHVEQUF1RCxDQUFDO3FCQUM1RixPQUFPLENBQUMsMEJBQTBCLEVBQUUsa0JBQWtCLENBQUM7cUJBQ3ZELE9BQU8sQ0FBQyxpQ0FBaUMsRUFBRSx1QkFBdUIsQ0FBQztxQkFDbkUsT0FBTyxDQUFDLGlDQUFpQyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQy9ELENBQUM7WUFFRCxPQUFPLFFBQVEsQ0FBQztRQUNsQixDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQWhGRCwwQ0FnRkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IEdyZWV0aW5nQ29uZmlnIH0gZnJvbSAnLi4vY29uZmlnL3BlcnNvbmFzLmpzJztcclxuaW1wb3J0IHR5cGUgeyBDb21wYW55SW5mbyB9IGZyb20gJy4vcGVyc29uYS1zZXJ2aWNlLmpzJztcclxuXHJcbi8qKlxyXG4gKiBTZXJ2aWNlIGZvciBnZW5lcmF0aW5nIHJhbmRvbWl6ZWQgcGVyc29uYSBncmVldGluZ3NcclxuICovXHJcbmV4cG9ydCBjbGFzcyBHcmVldGluZ1NlcnZpY2Uge1xyXG4gIC8qKlxyXG4gICAqIEdlbmVyYXRlIGEgcmFuZG9tIGdyZWV0aW5nIGZyb20gdGhlIHBlcnNvbmEncyBncmVldGluZyBjb25maWd1cmF0aW9uXHJcbiAgICovXHJcbiAgc3RhdGljIGdlbmVyYXRlR3JlZXRpbmcoZ3JlZXRpbmdDb25maWc/OiBHcmVldGluZ0NvbmZpZywgY29tcGFueUluZm8/OiBDb21wYW55SW5mbyk6IHN0cmluZyB7XHJcbiAgICBpZiAoIWdyZWV0aW5nQ29uZmlnIHx8ICFncmVldGluZ0NvbmZpZy52YXJpYXRpb25zIHx8IGdyZWV0aW5nQ29uZmlnLnZhcmlhdGlvbnMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIHJldHVybiBcIkhlbGxvISBIb3cgY2FuIEkgaGVscCB5b3UgdG9kYXk/XCI7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUGljayBhIHJhbmRvbSB2YXJpYXRpb25cclxuICAgIGNvbnN0IHJhbmRvbUluZGV4ID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogZ3JlZXRpbmdDb25maWcudmFyaWF0aW9ucy5sZW5ndGgpO1xyXG4gICAgbGV0IGdyZWV0aW5nID0gZ3JlZXRpbmdDb25maWcudmFyaWF0aW9uc1tyYW5kb21JbmRleF07XHJcblxyXG4gICAgLy8gUmVwbGFjZSBjb21wYW55IHBsYWNlaG9sZGVyc1xyXG4gICAgaWYgKGNvbXBhbnlJbmZvKSB7XHJcbiAgICAgIGdyZWV0aW5nID0gZ3JlZXRpbmdcclxuICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueU5hbWVcXH1cXH0vZywgY29tcGFueUluZm8ubmFtZSB8fCAnUGxhbmV0IEZpdG5lc3MxJylcclxuICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueUluZHVzdHJ5XFx9XFx9L2csIGNvbXBhbnlJbmZvLmluZHVzdHJ5IHx8ICdCaWcgQm94IEd5bXMnKVxyXG4gICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55RGVzY3JpcHRpb25cXH1cXH0vZywgY29tcGFueUluZm8uZGVzY3JpcHRpb24gfHwgJ1BsYW5ldCBGaXRuZXNzMiBpcyBhIGdsb2JhbCBmcmFuY2hpc29yIGFuZCBvcGVyYXRvciBvZiBmaXRuZXNzIGNlbnRlcnMga25vd24gYXMgYSBcIkp1ZGdlbWVudCBGcmVlIFpvbmVcIiBmb3IgY2FzdWFsIGd5bS1nb2VycycpXHJcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlQcm9kdWN0c1xcfVxcfS9nLCBjb21wYW55SW5mby5wcm9kdWN0cyB8fCAnQmlnIGZpdG5lc3MgYnV0IGFsc28gaGFzIGFwcGFycmVsLCBjb2ZmZWUsIGFuZCBhIGNhZmUnKVxyXG4gICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55QmVuZWZpdHNcXH1cXH0vZywgY29tcGFueUluZm8uYmVuZWZpdHMgfHwgJ09ubHkgJDEwIGEgbW9udGgnKVxyXG4gICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55VGFyZ2V0Q3VzdG9tZXJzXFx9XFx9L2csIGNvbXBhbnlJbmZvLnRhcmdldEN1c3RvbWVycyB8fCAnUGVvcGxlIHdobyBzZWVrIHZhbHVlJylcclxuICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueURpZmZlcmVudGlhdG9yc1xcfVxcfS9nLCBjb21wYW55SW5mby5kaWZmZXJlbnRpYXRvcnMgfHwgJ0Jlc3QgcHJpY2VzJyk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAvLyBEZWZhdWx0IHZhbHVlc1xyXG4gICAgICBncmVldGluZyA9IGdyZWV0aW5nXHJcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlOYW1lXFx9XFx9L2csICdQbGFuZXQgRml0bmVzczMnKVxyXG4gICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55SW5kdXN0cnlcXH1cXH0vZywgJ0JpZyBCb3ggR3ltcycpXHJcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlEZXNjcmlwdGlvblxcfVxcfS9nLCAnUGxhbmV0IEZpdG5lc3M0IGlzIGEgZ2xvYmFsIGZyYW5jaGlzb3IgYW5kIG9wZXJhdG9yIG9mIGZpdG5lc3MgY2VudGVycyBrbm93biBhcyBhIFwiSnVkZ2VtZW50IEZyZWUgWm9uZVwiIGZvciBjYXN1YWwgZ3ltLWdvZXJzJylcclxuICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueVByb2R1Y3RzXFx9XFx9L2csICdCaWcgZml0bmVzcyBidXQgYWxzbyBoYXMgYXBwYXJyZWwsIGNvZmZlZSwgYW5kIGEgY2FmZScpXHJcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlCZW5lZml0c1xcfVxcfS9nLCAnT25seSAkMTAgYSBtb250aCcpXHJcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlUYXJnZXRDdXN0b21lcnNcXH1cXH0vZywgJ1Blb3BsZSB3aG8gc2VlayB2YWx1ZScpXHJcbiAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlEaWZmZXJlbnRpYXRvcnNcXH1cXH0vZywgJ0Jlc3QgcHJpY2VzJyk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGdyZWV0aW5nO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IHRoZSBncmVldGluZyBnaXN0L2Rlc2NyaXB0aW9uIGZvciBhIHBlcnNvbmFcclxuICAgKi9cclxuICBzdGF0aWMgZ2V0R3JlZXRpbmdHaXN0KGdyZWV0aW5nQ29uZmlnPzogR3JlZXRpbmdDb25maWcpOiBzdHJpbmcge1xyXG4gICAgcmV0dXJuIGdyZWV0aW5nQ29uZmlnPy5naXN0IHx8IFwiU3RhbmRhcmQgZnJpZW5kbHkgZ3JlZXRpbmdcIjtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBhbGwgZ3JlZXRpbmcgdmFyaWF0aW9ucyBmb3IgYSBwZXJzb25hICh1c2VmdWwgZm9yIHRlc3RpbmcvcHJldmlldylcclxuICAgKi9cclxuICBzdGF0aWMgZ2V0R3JlZXRpbmdWYXJpYXRpb25zKGdyZWV0aW5nQ29uZmlnPzogR3JlZXRpbmdDb25maWcsIGNvbXBhbnlJbmZvPzogQ29tcGFueUluZm8pOiBzdHJpbmdbXSB7XHJcbiAgICBpZiAoIWdyZWV0aW5nQ29uZmlnIHx8ICFncmVldGluZ0NvbmZpZy52YXJpYXRpb25zKSB7XHJcbiAgICAgIHJldHVybiBbXCJIZWxsbyEgSG93IGNhbiBJIGhlbHAgeW91IHRvZGF5P1wiXTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZ3JlZXRpbmdDb25maWcudmFyaWF0aW9ucy5tYXAodmFyaWF0aW9uID0+IHtcclxuICAgICAgbGV0IGdyZWV0aW5nID0gdmFyaWF0aW9uO1xyXG4gICAgICBcclxuICAgICAgLy8gUmVwbGFjZSBjb21wYW55IHBsYWNlaG9sZGVyc1xyXG4gICAgICBpZiAoY29tcGFueUluZm8pIHtcclxuICAgICAgICBncmVldGluZyA9IGdyZWV0aW5nXHJcbiAgICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueU5hbWVcXH1cXH0vZywgY29tcGFueUluZm8ubmFtZSB8fCAnUGxhbmV0IEZpdG5lc3M1JylcclxuICAgICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55SW5kdXN0cnlcXH1cXH0vZywgY29tcGFueUluZm8uaW5kdXN0cnkgfHwgJ0JpZyBCb3ggR3ltcycpXHJcbiAgICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueURlc2NyaXB0aW9uXFx9XFx9L2csIGNvbXBhbnlJbmZvLmRlc2NyaXB0aW9uIHx8ICdQbGFuZXQgRml0bmVzczYgaXMgYSBnbG9iYWwgZnJhbmNoaXNvciBhbmQgb3BlcmF0b3Igb2YgZml0bmVzcyBjZW50ZXJzJylcclxuICAgICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55UHJvZHVjdHNcXH1cXH0vZywgY29tcGFueUluZm8ucHJvZHVjdHMgfHwgJ0JpZyBmaXRuZXNzIGJ1dCBhbHNvIGhhcyBhcHBhcnJlbCwgY29mZmVlLCBhbmQgYSBjYWZlJylcclxuICAgICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55QmVuZWZpdHNcXH1cXH0vZywgY29tcGFueUluZm8uYmVuZWZpdHMgfHwgJ09ubHkgJDEwIGEgbW9udGgnKVxyXG4gICAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlUYXJnZXRDdXN0b21lcnNcXH1cXH0vZywgY29tcGFueUluZm8udGFyZ2V0Q3VzdG9tZXJzIHx8ICdQZW9wbGUgd2hvIHNlZWsgdmFsdWUnKVxyXG4gICAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlEaWZmZXJlbnRpYXRvcnNcXH1cXH0vZywgY29tcGFueUluZm8uZGlmZmVyZW50aWF0b3JzIHx8ICdCZXN0IHByaWNlcycpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGdyZWV0aW5nID0gZ3JlZXRpbmdcclxuICAgICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55TmFtZVxcfVxcfS9nLCAnUGxhbmV0IEZpdG5lc3M3JylcclxuICAgICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55SW5kdXN0cnlcXH1cXH0vZywgJ0JpZyBCb3ggR3ltcycpXHJcbiAgICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueURlc2NyaXB0aW9uXFx9XFx9L2csICdQbGFuZXQgRml0bmVzczggaXMgYSBnbG9iYWwgZnJhbmNoaXNvciBhbmQgb3BlcmF0b3Igb2YgZml0bmVzcyBjZW50ZXJzJylcclxuICAgICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55UHJvZHVjdHNcXH1cXH0vZywgJ0JpZyBmaXRuZXNzIGJ1dCBhbHNvIGhhcyBhcHBhcnJlbCwgY29mZmVlLCBhbmQgYSBjYWZlJylcclxuICAgICAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55QmVuZWZpdHNcXH1cXH0vZywgJ09ubHkgJDEwIGEgbW9udGgnKVxyXG4gICAgICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlUYXJnZXRDdXN0b21lcnNcXH1cXH0vZywgJ1Blb3BsZSB3aG8gc2VlayB2YWx1ZScpXHJcbiAgICAgICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueURpZmZlcmVudGlhdG9yc1xcfVxcfS9nLCAnQmVzdCBwcmljZXMnKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgcmV0dXJuIGdyZWV0aW5nO1xyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcblxyXG4iXX0=
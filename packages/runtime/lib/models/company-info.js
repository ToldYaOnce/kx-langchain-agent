"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyInfo = void 0;
// Note: These decorators would come from @toldyaonce/kx-aws-utils when available
// For now, using placeholder decorators
const Table = (options) => (target) => target;
const Column = (options) => (target, propertyKey) => { };
const PrimaryKey = () => (target, propertyKey) => { };
const StringColumn = (options) => (target, propertyKey) => { };
let CompanyInfo = class CompanyInfo {
};
exports.CompanyInfo = CompanyInfo;
__decorate([
    PrimaryKey()
], CompanyInfo.prototype, "tenantId", void 0);
__decorate([
    StringColumn({ length: 200 })
], CompanyInfo.prototype, "name", void 0);
__decorate([
    StringColumn({ length: 100 })
], CompanyInfo.prototype, "industry", void 0);
__decorate([
    Column({ type: 'text' })
], CompanyInfo.prototype, "description", void 0);
__decorate([
    Column({ type: 'text' })
], CompanyInfo.prototype, "products", void 0);
__decorate([
    Column({ type: 'text' })
], CompanyInfo.prototype, "benefits", void 0);
__decorate([
    Column({ type: 'text' })
], CompanyInfo.prototype, "targetCustomers", void 0);
__decorate([
    Column({ type: 'text' })
], CompanyInfo.prototype, "differentiators", void 0);
__decorate([
    Column({ type: 'jsonb' })
], CompanyInfo.prototype, "intentCapturing", void 0);
__decorate([
    Column({ type: 'datetime' })
], CompanyInfo.prototype, "createdAt", void 0);
__decorate([
    Column({ type: 'datetime' })
], CompanyInfo.prototype, "updatedAt", void 0);
exports.CompanyInfo = CompanyInfo = __decorate([
    Table({ name: 'company_info', primaryKey: 'tenantId' })
], CompanyInfo);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcGFueS1pbmZvLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL21vZGVscy9jb21wYW55LWluZm8udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBQUEsaUZBQWlGO0FBQ2pGLHdDQUF3QztBQUN4QyxNQUFNLEtBQUssR0FBRyxDQUFDLE9BQVksRUFBRSxFQUFFLENBQUMsQ0FBQyxNQUFXLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQztBQUN4RCxNQUFNLE1BQU0sR0FBRyxDQUFDLE9BQVksRUFBRSxFQUFFLENBQUMsQ0FBQyxNQUFXLEVBQUUsV0FBbUIsRUFBRSxFQUFFLEdBQUUsQ0FBQyxDQUFDO0FBQzFFLE1BQU0sVUFBVSxHQUFHLEdBQUcsRUFBRSxDQUFDLENBQUMsTUFBVyxFQUFFLFdBQW1CLEVBQUUsRUFBRSxHQUFFLENBQUMsQ0FBQztBQUNsRSxNQUFNLFlBQVksR0FBRyxDQUFDLE9BQVksRUFBRSxFQUFFLENBQUMsQ0FBQyxNQUFXLEVBQUUsV0FBbUIsRUFBRSxFQUFFLEdBQUUsQ0FBQyxDQUFDO0FBcUN6RSxJQUFNLFdBQVcsR0FBakIsTUFBTSxXQUFXO0NBa0N2QixDQUFBO0FBbENZLGtDQUFXO0FBRXRCO0lBREMsVUFBVSxFQUFFOzZDQUNLO0FBR2xCO0lBREMsWUFBWSxDQUFDLEVBQUUsTUFBTSxFQUFFLEdBQUcsRUFBRSxDQUFDO3lDQUNoQjtBQUdkO0lBREMsWUFBWSxDQUFDLEVBQUUsTUFBTSxFQUFFLEdBQUcsRUFBRSxDQUFDOzZDQUNaO0FBR2xCO0lBREMsTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDO2dEQUNKO0FBR3JCO0lBREMsTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDOzZDQUNQO0FBR2xCO0lBREMsTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDOzZDQUNQO0FBR2xCO0lBREMsTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDO29EQUNBO0FBR3pCO0lBREMsTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxDQUFDO29EQUNBO0FBSXpCO0lBREMsTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxDQUFDO29EQUNRO0FBR2xDO0lBREMsTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxDQUFDOzhDQUNaO0FBR2pCO0lBREMsTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxDQUFDOzhDQUNaO3NCQWpDTixXQUFXO0lBRHZCLEtBQUssQ0FBQyxFQUFFLElBQUksRUFBRSxjQUFjLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxDQUFDO0dBQzNDLFdBQVcsQ0FrQ3ZCIiwic291cmNlc0NvbnRlbnQiOlsiLy8gTm90ZTogVGhlc2UgZGVjb3JhdG9ycyB3b3VsZCBjb21lIGZyb20gQHRvbGR5YW9uY2Uva3gtYXdzLXV0aWxzIHdoZW4gYXZhaWxhYmxlXHJcbi8vIEZvciBub3csIHVzaW5nIHBsYWNlaG9sZGVyIGRlY29yYXRvcnNcclxuY29uc3QgVGFibGUgPSAob3B0aW9uczogYW55KSA9PiAodGFyZ2V0OiBhbnkpID0+IHRhcmdldDtcclxuY29uc3QgQ29sdW1uID0gKG9wdGlvbnM6IGFueSkgPT4gKHRhcmdldDogYW55LCBwcm9wZXJ0eUtleTogc3RyaW5nKSA9PiB7fTtcclxuY29uc3QgUHJpbWFyeUtleSA9ICgpID0+ICh0YXJnZXQ6IGFueSwgcHJvcGVydHlLZXk6IHN0cmluZykgPT4ge307XHJcbmNvbnN0IFN0cmluZ0NvbHVtbiA9IChvcHRpb25zOiBhbnkpID0+ICh0YXJnZXQ6IGFueSwgcHJvcGVydHlLZXk6IHN0cmluZykgPT4ge307XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEludGVudCB7XHJcbiAgaWQ6IHN0cmluZztcclxuICBuYW1lOiBzdHJpbmc7XHJcbiAgZGVzY3JpcHRpb246IHN0cmluZztcclxuICB0cmlnZ2Vyczogc3RyaW5nW107XHJcbiAgcGF0dGVybnM6IHN0cmluZ1tdO1xyXG4gIHByaW9yaXR5OiAnaGlnaCcgfCAnbWVkaXVtJyB8ICdsb3cnO1xyXG4gIHJlc3BvbnNlOiB7XHJcbiAgICB0eXBlOiAndGVtcGxhdGUnIHwgJ29wZXJhdGlvbmFsJyB8ICdwZXJzb25hX2hhbmRsZWQnIHwgJ2NvbnZlcnNhdGlvbmFsJztcclxuICAgIHRlbXBsYXRlOiBzdHJpbmc7XHJcbiAgICBmb2xsb3dVcDogc3RyaW5nW107XHJcbiAgfTtcclxuICBhY3Rpb25zOiBzdHJpbmdbXTtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBJbnRlbnRDYXB0dXJpbmcge1xyXG4gIGVuYWJsZWQ6IGJvb2xlYW47XHJcbiAgaW50ZW50czogSW50ZW50W107XHJcbiAgZmFsbGJhY2tJbnRlbnQ6IHtcclxuICAgIGlkOiBzdHJpbmc7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBkZXNjcmlwdGlvbjogc3RyaW5nO1xyXG4gICAgcmVzcG9uc2U6IHtcclxuICAgICAgdHlwZTogc3RyaW5nO1xyXG4gICAgICB0ZW1wbGF0ZTogc3RyaW5nO1xyXG4gICAgfTtcclxuICAgIGFjdGlvbnM6IHN0cmluZ1tdO1xyXG4gIH07XHJcbiAgY29uZmlkZW5jZToge1xyXG4gICAgdGhyZXNob2xkOiBudW1iZXI7XHJcbiAgICBtdWx0aXBsZUludGVudEhhbmRsaW5nOiBzdHJpbmc7XHJcbiAgfTtcclxufVxyXG5cclxuQFRhYmxlKHsgbmFtZTogJ2NvbXBhbnlfaW5mbycsIHByaW1hcnlLZXk6ICd0ZW5hbnRJZCcgfSlcclxuZXhwb3J0IGNsYXNzIENvbXBhbnlJbmZvIHtcclxuICBAUHJpbWFyeUtleSgpXHJcbiAgdGVuYW50SWQhOiBzdHJpbmc7XHJcblxyXG4gIEBTdHJpbmdDb2x1bW4oeyBsZW5ndGg6IDIwMCB9KVxyXG4gIG5hbWUhOiBzdHJpbmc7XHJcblxyXG4gIEBTdHJpbmdDb2x1bW4oeyBsZW5ndGg6IDEwMCB9KVxyXG4gIGluZHVzdHJ5ITogc3RyaW5nO1xyXG5cclxuICBAQ29sdW1uKHsgdHlwZTogJ3RleHQnIH0pXHJcbiAgZGVzY3JpcHRpb24hOiBzdHJpbmc7XHJcblxyXG4gIEBDb2x1bW4oeyB0eXBlOiAndGV4dCcgfSlcclxuICBwcm9kdWN0cyE6IHN0cmluZztcclxuXHJcbiAgQENvbHVtbih7IHR5cGU6ICd0ZXh0JyB9KVxyXG4gIGJlbmVmaXRzITogc3RyaW5nO1xyXG5cclxuICBAQ29sdW1uKHsgdHlwZTogJ3RleHQnIH0pXHJcbiAgdGFyZ2V0Q3VzdG9tZXJzITogc3RyaW5nO1xyXG5cclxuICBAQ29sdW1uKHsgdHlwZTogJ3RleHQnIH0pXHJcbiAgZGlmZmVyZW50aWF0b3JzITogc3RyaW5nO1xyXG5cclxuICAvLyBDb21wYW55LWxldmVsIGludGVudCBjb25maWd1cmF0aW9uXHJcbiAgQENvbHVtbih7IHR5cGU6ICdqc29uYicgfSlcclxuICBpbnRlbnRDYXB0dXJpbmchOiBJbnRlbnRDYXB0dXJpbmc7XHJcblxyXG4gIEBDb2x1bW4oeyB0eXBlOiAnZGF0ZXRpbWUnIH0pXHJcbiAgY3JlYXRlZEF0ITogRGF0ZTtcclxuXHJcbiAgQENvbHVtbih7IHR5cGU6ICdkYXRldGltZScgfSlcclxuICB1cGRhdGVkQXQhOiBEYXRlO1xyXG59XHJcbiJdfQ==
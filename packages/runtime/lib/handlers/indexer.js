"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const eventbridge_js_1 = require("../lib/eventbridge.js");
const config_js_1 = require("../lib/config.js");
/**
 * Optional Lambda handler for RAG document indexing
 * Triggered by S3 events when documents are uploaded for a tenant
 */
async function handler(event, context) {
    console.log('Indexer received S3 event:', JSON.stringify(event, null, 2));
    try {
        // Load and validate configuration
        const config = (0, config_js_1.loadRuntimeConfig)();
        (0, config_js_1.validateRuntimeConfig)(config);
        // Initialize services
        const eventBridgeService = new eventbridge_js_1.EventBridgeService(config);
        // Process each S3 record
        for (const record of event.Records) {
            const bucketName = record.s3.bucket.name;
            const objectKey = record.s3.object.key;
            console.log(`Processing document: s3://${bucketName}/${objectKey}`);
            // Extract tenant ID from object key (assuming format: tenantId/documents/...)
            const tenantId = extractTenantIdFromKey(objectKey);
            if (!tenantId) {
                console.warn(`Could not extract tenant ID from key: ${objectKey}`);
                continue;
            }
            try {
                // TODO: Implement actual document processing and indexing
                // This would involve:
                // 1. Download document from S3
                // 2. Extract text content (PDF, DOCX, etc.)
                // 3. Chunk the content
                // 4. Generate embeddings using Bedrock
                // 5. Store in OpenSearch Serverless with tenant-specific index
                await processDocument(tenantId, bucketName, objectKey, config);
                // Emit success event
                await eventBridgeService.publishAgentTrace(eventbridge_js_1.EventBridgeService.createAgentTraceEvent(tenantId, 'rag.index.updated', {
                    metadata: {
                        bucket: bucketName,
                        key: objectKey,
                        event_name: record.eventName,
                    },
                }));
                console.log(`Successfully indexed document for tenant ${tenantId}`);
            }
            catch (docError) {
                console.error(`Failed to process document ${objectKey}:`, docError);
                // Emit error event
                await eventBridgeService.publishAgentError(eventbridge_js_1.EventBridgeService.createAgentErrorEvent(tenantId, `Failed to index document: ${docError instanceof Error ? docError.message : 'Unknown error'}`, {
                    context: {
                        bucket: bucketName,
                        key: objectKey,
                        event_name: record.eventName,
                    },
                }));
            }
        }
        console.log('Indexer completed successfully');
    }
    catch (error) {
        console.error('Indexer error:', error);
        throw error;
    }
}
/**
 * Extract tenant ID from S3 object key
 * Assumes format: {tenantId}/documents/{filename} or similar
 */
function extractTenantIdFromKey(objectKey) {
    const parts = objectKey.split('/');
    if (parts.length >= 2) {
        return parts[0];
    }
    return null;
}
/**
 * Process and index a document for RAG
 * This is a placeholder implementation - would need to be completed based on requirements
 */
async function processDocument(tenantId, bucketName, objectKey, config) {
    // Placeholder implementation
    console.log(`Processing document for tenant ${tenantId}: s3://${bucketName}/${objectKey}`);
    // TODO: Implement actual document processing:
    // 1. Download from S3
    // 2. Extract text (using libraries like pdf-parse, mammoth for DOCX, etc.)
    // 3. Chunk the text into manageable pieces
    // 4. Generate embeddings using Bedrock Titan Embeddings
    // 5. Store in OpenSearch Serverless with index name: kxgen_{tenantId}
    // For now, just simulate processing
    await new Promise(resolve => setTimeout(resolve, 100));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXhlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9oYW5kbGVycy9pbmRleGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBUUEsMEJBbUZDO0FBMUZELDBEQUEyRDtBQUMzRCxnREFBNEU7QUFFNUU7OztHQUdHO0FBQ0ksS0FBSyxVQUFVLE9BQU8sQ0FDM0IsS0FBYyxFQUNkLE9BQWdCO0lBRWhCLE9BQU8sQ0FBQyxHQUFHLENBQUMsNEJBQTRCLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFMUUsSUFBSSxDQUFDO1FBQ0gsa0NBQWtDO1FBQ2xDLE1BQU0sTUFBTSxHQUFHLElBQUEsNkJBQWlCLEdBQUUsQ0FBQztRQUNuQyxJQUFBLGlDQUFxQixFQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRTlCLHNCQUFzQjtRQUN0QixNQUFNLGtCQUFrQixHQUFHLElBQUksbUNBQWtCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFMUQseUJBQXlCO1FBQ3pCLEtBQUssTUFBTSxNQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ25DLE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztZQUN6QyxNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUM7WUFFdkMsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsVUFBVSxJQUFJLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFFcEUsOEVBQThFO1lBQzlFLE1BQU0sUUFBUSxHQUFHLHNCQUFzQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBRW5ELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDZCxPQUFPLENBQUMsSUFBSSxDQUFDLHlDQUF5QyxTQUFTLEVBQUUsQ0FBQyxDQUFDO2dCQUNuRSxTQUFTO1lBQ1gsQ0FBQztZQUVELElBQUksQ0FBQztnQkFDSCwwREFBMEQ7Z0JBQzFELHNCQUFzQjtnQkFDdEIsK0JBQStCO2dCQUMvQiw0Q0FBNEM7Z0JBQzVDLHVCQUF1QjtnQkFDdkIsdUNBQXVDO2dCQUN2QywrREFBK0Q7Z0JBRS9ELE1BQU0sZUFBZSxDQUFDLFFBQVEsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUUvRCxxQkFBcUI7Z0JBQ3JCLE1BQU0sa0JBQWtCLENBQUMsaUJBQWlCLENBQ3hDLG1DQUFrQixDQUFDLHFCQUFxQixDQUN0QyxRQUFRLEVBQ1IsbUJBQW1CLEVBQ25CO29CQUNFLFFBQVEsRUFBRTt3QkFDUixNQUFNLEVBQUUsVUFBVTt3QkFDbEIsR0FBRyxFQUFFLFNBQVM7d0JBQ2QsVUFBVSxFQUFFLE1BQU0sQ0FBQyxTQUFTO3FCQUM3QjtpQkFDRixDQUNGLENBQ0YsQ0FBQztnQkFFRixPQUFPLENBQUMsR0FBRyxDQUFDLDRDQUE0QyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBRXRFLENBQUM7WUFBQyxPQUFPLFFBQVEsRUFBRSxDQUFDO2dCQUNsQixPQUFPLENBQUMsS0FBSyxDQUFDLDhCQUE4QixTQUFTLEdBQUcsRUFBRSxRQUFRLENBQUMsQ0FBQztnQkFFcEUsbUJBQW1CO2dCQUNuQixNQUFNLGtCQUFrQixDQUFDLGlCQUFpQixDQUN4QyxtQ0FBa0IsQ0FBQyxxQkFBcUIsQ0FDdEMsUUFBUSxFQUNSLDZCQUE2QixRQUFRLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxlQUFlLEVBQUUsRUFDN0Y7b0JBQ0UsT0FBTyxFQUFFO3dCQUNQLE1BQU0sRUFBRSxVQUFVO3dCQUNsQixHQUFHLEVBQUUsU0FBUzt3QkFDZCxVQUFVLEVBQUUsTUFBTSxDQUFDLFNBQVM7cUJBQzdCO2lCQUNGLENBQ0YsQ0FDRixDQUFDO1lBQ0osQ0FBQztRQUNILENBQUM7UUFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLGdDQUFnQyxDQUFDLENBQUM7SUFFaEQsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3ZDLE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUM7QUFFRDs7O0dBR0c7QUFDSCxTQUFTLHNCQUFzQixDQUFDLFNBQWlCO0lBQy9DLE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDbkMsSUFBSSxLQUFLLENBQUMsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDO1FBQ3RCLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2xCLENBQUM7SUFDRCxPQUFPLElBQUksQ0FBQztBQUNkLENBQUM7QUFFRDs7O0dBR0c7QUFDSCxLQUFLLFVBQVUsZUFBZSxDQUM1QixRQUFnQixFQUNoQixVQUFrQixFQUNsQixTQUFpQixFQUNqQixNQUFXO0lBRVgsNkJBQTZCO0lBQzdCLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0NBQWtDLFFBQVEsVUFBVSxVQUFVLElBQUksU0FBUyxFQUFFLENBQUMsQ0FBQztJQUUzRiw4Q0FBOEM7SUFDOUMsc0JBQXNCO0lBQ3RCLDJFQUEyRTtJQUMzRSwyQ0FBMkM7SUFDM0Msd0RBQXdEO0lBQ3hELHNFQUFzRTtJQUV0RSxvQ0FBb0M7SUFDcEMsTUFBTSxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUN6RCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBTM0V2ZW50LCBDb250ZXh0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XHJcbmltcG9ydCB7IEV2ZW50QnJpZGdlU2VydmljZSB9IGZyb20gJy4uL2xpYi9ldmVudGJyaWRnZS5qcyc7XHJcbmltcG9ydCB7IGxvYWRSdW50aW1lQ29uZmlnLCB2YWxpZGF0ZVJ1bnRpbWVDb25maWcgfSBmcm9tICcuLi9saWIvY29uZmlnLmpzJztcclxuXHJcbi8qKlxyXG4gKiBPcHRpb25hbCBMYW1iZGEgaGFuZGxlciBmb3IgUkFHIGRvY3VtZW50IGluZGV4aW5nXHJcbiAqIFRyaWdnZXJlZCBieSBTMyBldmVudHMgd2hlbiBkb2N1bWVudHMgYXJlIHVwbG9hZGVkIGZvciBhIHRlbmFudFxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZXIoXHJcbiAgZXZlbnQ6IFMzRXZlbnQsXHJcbiAgY29udGV4dDogQ29udGV4dFxyXG4pOiBQcm9taXNlPHZvaWQ+IHtcclxuICBjb25zb2xlLmxvZygnSW5kZXhlciByZWNlaXZlZCBTMyBldmVudDonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xyXG4gIFxyXG4gIHRyeSB7XHJcbiAgICAvLyBMb2FkIGFuZCB2YWxpZGF0ZSBjb25maWd1cmF0aW9uXHJcbiAgICBjb25zdCBjb25maWcgPSBsb2FkUnVudGltZUNvbmZpZygpO1xyXG4gICAgdmFsaWRhdGVSdW50aW1lQ29uZmlnKGNvbmZpZyk7XHJcbiAgICBcclxuICAgIC8vIEluaXRpYWxpemUgc2VydmljZXNcclxuICAgIGNvbnN0IGV2ZW50QnJpZGdlU2VydmljZSA9IG5ldyBFdmVudEJyaWRnZVNlcnZpY2UoY29uZmlnKTtcclxuICAgIFxyXG4gICAgLy8gUHJvY2VzcyBlYWNoIFMzIHJlY29yZFxyXG4gICAgZm9yIChjb25zdCByZWNvcmQgb2YgZXZlbnQuUmVjb3Jkcykge1xyXG4gICAgICBjb25zdCBidWNrZXROYW1lID0gcmVjb3JkLnMzLmJ1Y2tldC5uYW1lO1xyXG4gICAgICBjb25zdCBvYmplY3RLZXkgPSByZWNvcmQuczMub2JqZWN0LmtleTtcclxuICAgICAgXHJcbiAgICAgIGNvbnNvbGUubG9nKGBQcm9jZXNzaW5nIGRvY3VtZW50OiBzMzovLyR7YnVja2V0TmFtZX0vJHtvYmplY3RLZXl9YCk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBFeHRyYWN0IHRlbmFudCBJRCBmcm9tIG9iamVjdCBrZXkgKGFzc3VtaW5nIGZvcm1hdDogdGVuYW50SWQvZG9jdW1lbnRzLy4uLilcclxuICAgICAgY29uc3QgdGVuYW50SWQgPSBleHRyYWN0VGVuYW50SWRGcm9tS2V5KG9iamVjdEtleSk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoIXRlbmFudElkKSB7XHJcbiAgICAgICAgY29uc29sZS53YXJuKGBDb3VsZCBub3QgZXh0cmFjdCB0ZW5hbnQgSUQgZnJvbSBrZXk6ICR7b2JqZWN0S2V5fWApO1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcbiAgICAgIFxyXG4gICAgICB0cnkge1xyXG4gICAgICAgIC8vIFRPRE86IEltcGxlbWVudCBhY3R1YWwgZG9jdW1lbnQgcHJvY2Vzc2luZyBhbmQgaW5kZXhpbmdcclxuICAgICAgICAvLyBUaGlzIHdvdWxkIGludm9sdmU6XHJcbiAgICAgICAgLy8gMS4gRG93bmxvYWQgZG9jdW1lbnQgZnJvbSBTM1xyXG4gICAgICAgIC8vIDIuIEV4dHJhY3QgdGV4dCBjb250ZW50IChQREYsIERPQ1gsIGV0Yy4pXHJcbiAgICAgICAgLy8gMy4gQ2h1bmsgdGhlIGNvbnRlbnRcclxuICAgICAgICAvLyA0LiBHZW5lcmF0ZSBlbWJlZGRpbmdzIHVzaW5nIEJlZHJvY2tcclxuICAgICAgICAvLyA1LiBTdG9yZSBpbiBPcGVuU2VhcmNoIFNlcnZlcmxlc3Mgd2l0aCB0ZW5hbnQtc3BlY2lmaWMgaW5kZXhcclxuICAgICAgICBcclxuICAgICAgICBhd2FpdCBwcm9jZXNzRG9jdW1lbnQodGVuYW50SWQsIGJ1Y2tldE5hbWUsIG9iamVjdEtleSwgY29uZmlnKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBFbWl0IHN1Y2Nlc3MgZXZlbnRcclxuICAgICAgICBhd2FpdCBldmVudEJyaWRnZVNlcnZpY2UucHVibGlzaEFnZW50VHJhY2UoXHJcbiAgICAgICAgICBFdmVudEJyaWRnZVNlcnZpY2UuY3JlYXRlQWdlbnRUcmFjZUV2ZW50KFxyXG4gICAgICAgICAgICB0ZW5hbnRJZCxcclxuICAgICAgICAgICAgJ3JhZy5pbmRleC51cGRhdGVkJyxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgIG1ldGFkYXRhOiB7XHJcbiAgICAgICAgICAgICAgICBidWNrZXQ6IGJ1Y2tldE5hbWUsXHJcbiAgICAgICAgICAgICAgICBrZXk6IG9iamVjdEtleSxcclxuICAgICAgICAgICAgICAgIGV2ZW50X25hbWU6IHJlY29yZC5ldmVudE5hbWUsXHJcbiAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgKVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc29sZS5sb2coYFN1Y2Nlc3NmdWxseSBpbmRleGVkIGRvY3VtZW50IGZvciB0ZW5hbnQgJHt0ZW5hbnRJZH1gKTtcclxuICAgICAgICBcclxuICAgICAgfSBjYXRjaCAoZG9jRXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gcHJvY2VzcyBkb2N1bWVudCAke29iamVjdEtleX06YCwgZG9jRXJyb3IpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEVtaXQgZXJyb3IgZXZlbnRcclxuICAgICAgICBhd2FpdCBldmVudEJyaWRnZVNlcnZpY2UucHVibGlzaEFnZW50RXJyb3IoXHJcbiAgICAgICAgICBFdmVudEJyaWRnZVNlcnZpY2UuY3JlYXRlQWdlbnRFcnJvckV2ZW50KFxyXG4gICAgICAgICAgICB0ZW5hbnRJZCxcclxuICAgICAgICAgICAgYEZhaWxlZCB0byBpbmRleCBkb2N1bWVudDogJHtkb2NFcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZG9jRXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ31gLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgY29udGV4dDoge1xyXG4gICAgICAgICAgICAgICAgYnVja2V0OiBidWNrZXROYW1lLFxyXG4gICAgICAgICAgICAgICAga2V5OiBvYmplY3RLZXksXHJcbiAgICAgICAgICAgICAgICBldmVudF9uYW1lOiByZWNvcmQuZXZlbnROYW1lLFxyXG4gICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIClcclxuICAgICAgICApO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKCdJbmRleGVyIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknKTtcclxuICAgIFxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCdJbmRleGVyIGVycm9yOicsIGVycm9yKTtcclxuICAgIHRocm93IGVycm9yO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEV4dHJhY3QgdGVuYW50IElEIGZyb20gUzMgb2JqZWN0IGtleVxyXG4gKiBBc3N1bWVzIGZvcm1hdDoge3RlbmFudElkfS9kb2N1bWVudHMve2ZpbGVuYW1lfSBvciBzaW1pbGFyXHJcbiAqL1xyXG5mdW5jdGlvbiBleHRyYWN0VGVuYW50SWRGcm9tS2V5KG9iamVjdEtleTogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgY29uc3QgcGFydHMgPSBvYmplY3RLZXkuc3BsaXQoJy8nKTtcclxuICBpZiAocGFydHMubGVuZ3RoID49IDIpIHtcclxuICAgIHJldHVybiBwYXJ0c1swXTtcclxuICB9XHJcbiAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBQcm9jZXNzIGFuZCBpbmRleCBhIGRvY3VtZW50IGZvciBSQUdcclxuICogVGhpcyBpcyBhIHBsYWNlaG9sZGVyIGltcGxlbWVudGF0aW9uIC0gd291bGQgbmVlZCB0byBiZSBjb21wbGV0ZWQgYmFzZWQgb24gcmVxdWlyZW1lbnRzXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBwcm9jZXNzRG9jdW1lbnQoXHJcbiAgdGVuYW50SWQ6IHN0cmluZyxcclxuICBidWNrZXROYW1lOiBzdHJpbmcsXHJcbiAgb2JqZWN0S2V5OiBzdHJpbmcsXHJcbiAgY29uZmlnOiBhbnlcclxuKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgLy8gUGxhY2Vob2xkZXIgaW1wbGVtZW50YXRpb25cclxuICBjb25zb2xlLmxvZyhgUHJvY2Vzc2luZyBkb2N1bWVudCBmb3IgdGVuYW50ICR7dGVuYW50SWR9OiBzMzovLyR7YnVja2V0TmFtZX0vJHtvYmplY3RLZXl9YCk7XHJcbiAgXHJcbiAgLy8gVE9ETzogSW1wbGVtZW50IGFjdHVhbCBkb2N1bWVudCBwcm9jZXNzaW5nOlxyXG4gIC8vIDEuIERvd25sb2FkIGZyb20gUzNcclxuICAvLyAyLiBFeHRyYWN0IHRleHQgKHVzaW5nIGxpYnJhcmllcyBsaWtlIHBkZi1wYXJzZSwgbWFtbW90aCBmb3IgRE9DWCwgZXRjLilcclxuICAvLyAzLiBDaHVuayB0aGUgdGV4dCBpbnRvIG1hbmFnZWFibGUgcGllY2VzXHJcbiAgLy8gNC4gR2VuZXJhdGUgZW1iZWRkaW5ncyB1c2luZyBCZWRyb2NrIFRpdGFuIEVtYmVkZGluZ3NcclxuICAvLyA1LiBTdG9yZSBpbiBPcGVuU2VhcmNoIFNlcnZlcmxlc3Mgd2l0aCBpbmRleCBuYW1lOiBreGdlbl97dGVuYW50SWR9XHJcbiAgXHJcbiAgLy8gRm9yIG5vdywganVzdCBzaW11bGF0ZSBwcm9jZXNzaW5nXHJcbiAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMCkpO1xyXG59XHJcbiJdfQ==
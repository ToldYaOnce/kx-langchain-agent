import type { S3Event, Context } from 'aws-lambda';
import { EventBridgeService } from '../lib/eventbridge.js';
import { loadRuntimeConfig, validateRuntimeConfig } from '../lib/config.js';

/**
 * Optional Lambda handler for RAG document indexing
 * Triggered by S3 events when documents are uploaded for a tenant
 */
export async function handler(
  event: S3Event,
  context: Context
): Promise<void> {
  console.log('Indexer received S3 event:', JSON.stringify(event, null, 2));
  
  try {
    // Load and validate configuration
    const config = loadRuntimeConfig();
    validateRuntimeConfig(config);
    
    // Initialize services
    const eventBridgeService = new EventBridgeService(config);
    
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
        await eventBridgeService.publishAgentTrace(
          EventBridgeService.createAgentTraceEvent(
            tenantId,
            'rag.index.updated',
            {
              metadata: {
                bucket: bucketName,
                key: objectKey,
                event_name: record.eventName,
              },
            }
          )
        );
        
        console.log(`Successfully indexed document for tenant ${tenantId}`);
        
      } catch (docError) {
        console.error(`Failed to process document ${objectKey}:`, docError);
        
        // Emit error event
        await eventBridgeService.publishAgentError(
          EventBridgeService.createAgentErrorEvent(
            tenantId,
            `Failed to index document: ${docError instanceof Error ? docError.message : 'Unknown error'}`,
            {
              context: {
                bucket: bucketName,
                key: objectKey,
                event_name: record.eventName,
              },
            }
          )
        );
      }
    }
    
    console.log('Indexer completed successfully');
    
  } catch (error) {
    console.error('Indexer error:', error);
    throw error;
  }
}

/**
 * Extract tenant ID from S3 object key
 * Assumes format: {tenantId}/documents/{filename} or similar
 */
function extractTenantIdFromKey(objectKey: string): string | null {
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
async function processDocument(
  tenantId: string,
  bucketName: string,
  objectKey: string,
  config: any
): Promise<void> {
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

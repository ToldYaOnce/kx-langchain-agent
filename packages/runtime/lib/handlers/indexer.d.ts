import type { S3Event, Context } from 'aws-lambda';
/**
 * Optional Lambda handler for RAG document indexing
 * Triggered by S3 events when documents are uploaded for a tenant
 */
export declare function handler(event: S3Event, context: Context): Promise<void>;

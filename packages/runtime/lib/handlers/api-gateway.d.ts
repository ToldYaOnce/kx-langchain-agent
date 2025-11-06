import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
/**
 * Lambda handler for API Gateway V2 (HTTP API) chat requests
 *
 * **Usage:**
 * ```
 * POST /chat
 * {
 *   "tenantId": "company123",
 *   "message": "Hi, I want to learn about boxing classes",
 *   "userEmail": "john.doe@example.com",
 *   "sessionId": "sess_abc123",
 *   "conversationId": "conv_xyz789",
 *   "metadata": { "source": "website_widget" }
 * }
 * ```
 *
 * **Response:**
 * ```
 * {
 *   "success": true,
 *   "message": "Hey champ! I'd love to help you get started with boxing! [boxing_glove]",
 *   "intent": {
 *     "id": "general_inquiry",
 *     "confidence": 0.85,
 *     "category": "information_request"
 *   },
 *   "metadata": {
 *     "processingTimeMs": 1250,
 *     "model": "anthropic.claude-3-sonnet-20240229-v1:0"
 *   },
 *   "conversationId": "conv_xyz789",
 *   "sessionId": "sess_abc123"
 * }
 * ```
 */
export declare function handler(event: APIGatewayProxyEventV2, context: Context): Promise<APIGatewayProxyResultV2>;
/**
 * Health check handler for API Gateway
 */
export declare function healthHandler(event: APIGatewayProxyEventV2, context: Context): Promise<APIGatewayProxyResultV2>;

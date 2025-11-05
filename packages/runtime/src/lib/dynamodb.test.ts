import { DynamoDBService } from './dynamodb.js';
import { createTestConfig } from './config.js';

describe('DynamoDBService', () => {
  let dynamoService: DynamoDBService;

  beforeEach(() => {
    const config = createTestConfig({
      dynamodbEndpoint: 'http://localhost:8000',
    });
    dynamoService = new DynamoDBService(config);
  });

  describe('createContactPK', () => {
    it('should create correct contact primary key', () => {
      const pk = DynamoDBService.createContactPK('tenant1', 'user@example.com');
      expect(pk).toBe('tenant1#user@example.com');
    });
  });

  describe('generateTimestampSK', () => {
    it('should generate ULID-based sort key', () => {
      const sk = DynamoDBService.generateTimestampSK();
      expect(sk).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    });

    it('should generate unique sort keys', () => {
      const sk1 = DynamoDBService.generateTimestampSK();
      const sk2 = DynamoDBService.generateTimestampSK();
      expect(sk1).not.toBe(sk2);
    });
  });

  describe('ulidToTimestamp', () => {
    it('should convert ULID to ISO timestamp', () => {
      const ulid = DynamoDBService.generateTimestampSK();
      const timestamp = DynamoDBService.ulidToTimestamp(ulid);
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should handle invalid ULID gracefully', () => {
      const timestamp = DynamoDBService.ulidToTimestamp('invalid');
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  // Note: Integration tests with actual DynamoDB would require setup/teardown
  // and are better suited for e2e test suites
});

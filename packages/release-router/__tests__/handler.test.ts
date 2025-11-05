import { handler } from "../src/handler";
import { SQSEvent } from "aws-lambda";
import { ReleaseAction } from "../src/types";

// Mock AWS SDK
jest.mock("@aws-sdk/client-eventbridge", () => {
  const mockSend = jest.fn();
  return {
    EventBridgeClient: jest.fn().mockImplementation(() => ({
      send: mockSend
    })),
    PutEventsCommand: jest.fn().mockImplementation((params) => params),
    __mockSend: mockSend // Export for test access
  };
});

describe("Release Router Handler", () => {
  let mockSend: jest.Mock;

  beforeEach(() => {
    // Get the mock from the mocked module
    const mockedModule = require("@aws-sdk/client-eventbridge");
    mockSend = mockedModule.__mockSend;
    
    jest.clearAllMocks();
    mockSend.mockResolvedValue({});
  });

  const createSQSEvent = (actions: ReleaseAction[]): SQSEvent => ({
    Records: actions.map((action, index) => ({
      messageId: `msg-${index}`,
      receiptHandle: `receipt-${index}`,
      body: JSON.stringify(action),
      attributes: {
        ApproximateReceiveCount: "1",
        SentTimestamp: "1699200000000",
        SenderId: "AIDAIENQZJOLO23YVJ4VO",
        ApproximateFirstReceiveTimestamp: "1699200000000"
      },
      messageAttributes: {},
      md5OfBody: "",
      eventSource: "aws:sqs",
      eventSourceARN: "arn:aws:sqs:us-east-1:123456789012:test-queue.fifo",
      awsRegion: "us-east-1"
    }))
  });

  test("processes READ action correctly", async () => {
    const action: ReleaseAction = {
      releaseEventId: "test-id",
      tenantId: "t-123",
      contact_pk: "contact#abc",
      conversation_id: "conv-abc",
      threadKey: "conv-abc",
      channel: "chat",
      kind: "READ",
      persona: "Carlos",
      message_id: "msg-in-001",
      dueAtMs: Date.now()
    };

    const event = createSQSEvent([action]);
    const result = await handler(event);

    expect(result.batchItemFailures).toHaveLength(0);
    expect(mockSend).toHaveBeenCalledTimes(1);
    
    const putEventsCommand = mockSend.mock.calls[0][0];
    expect(putEventsCommand.Entries[0].DetailType).toBe("agent.message.read");
    expect(putEventsCommand.Entries[0].Source).toBe("kxgen.agent");
    
    const detail = JSON.parse(putEventsCommand.Entries[0].Detail);
    expect(detail.tenantId).toBe("t-123");
    expect(detail.contact_pk).toBe("contact#abc");
    expect(detail.channel).toBe("chat");
    expect(detail.message_id).toBe("msg-in-001");
    expect(detail.timestamps.at).toBeDefined();
  });

  test("processes TYPING_ON action correctly", async () => {
    const action: ReleaseAction = {
      releaseEventId: "test-id",
      tenantId: "t-123",
      contact_pk: "contact#abc",
      threadKey: "conv-abc",
      channel: "chat",
      kind: "TYPING_ON",
      persona: "Carlos",
      message_id: "msg-in-001",
      dueAtMs: Date.now()
    };

    const event = createSQSEvent([action]);
    const result = await handler(event);

    expect(result.batchItemFailures).toHaveLength(0);
    expect(mockSend).toHaveBeenCalledTimes(1);
    
    const putEventsCommand = mockSend.mock.calls[0][0];
    expect(putEventsCommand.Entries[0].DetailType).toBe("agent.typing.started");
    
    const detail = JSON.parse(putEventsCommand.Entries[0].Detail);
    expect(detail.persona).toBe("Carlos");
  });

  test("processes TYPING_OFF action correctly", async () => {
    const action: ReleaseAction = {
      releaseEventId: "test-id",
      tenantId: "t-123",
      contact_pk: "contact#abc",
      threadKey: "conv-abc",
      channel: "chat",
      kind: "TYPING_OFF",
      persona: "Carlos",
      message_id: "msg-in-001",
      dueAtMs: Date.now()
    };

    const event = createSQSEvent([action]);
    const result = await handler(event);

    expect(result.batchItemFailures).toHaveLength(0);
    expect(mockSend).toHaveBeenCalledTimes(1);
    
    const putEventsCommand = mockSend.mock.calls[0][0];
    expect(putEventsCommand.Entries[0].DetailType).toBe("agent.typing.stopped");
  });

  test("processes FINAL action correctly", async () => {
    const action: ReleaseAction = {
      releaseEventId: "test-id",
      tenantId: "t-123",
      contact_pk: "contact#abc",
      threadKey: "conv-abc",
      channel: "chat",
      kind: "FINAL",
      persona: "Carlos",
      replyText: "Hey champ! 🥊 How can I help you today?",
      message_id: "msg-in-001",
      dueAtMs: Date.now()
    };

    const event = createSQSEvent([action]);
    const result = await handler(event);

    expect(result.batchItemFailures).toHaveLength(0);
    expect(mockSend).toHaveBeenCalledTimes(1);
    
    const putEventsCommand = mockSend.mock.calls[0][0];
    expect(putEventsCommand.Entries[0].DetailType).toBe("agent.reply.created");
    
    const detail = JSON.parse(putEventsCommand.Entries[0].Detail);
    expect(detail.text).toBe("Hey champ! 🥊 How can I help you today?");
    expect(detail.preferredChannel).toBe("chat");
  });

  test("handles multiple actions in batch", async () => {
    const actions: ReleaseAction[] = [
      {
        releaseEventId: "test-id-1",
        tenantId: "t-123",
        contact_pk: "contact#abc",
        threadKey: "conv-abc",
        channel: "chat",
        kind: "READ",
        message_id: "msg-in-001",
        dueAtMs: Date.now()
      },
      {
        releaseEventId: "test-id-2",
        tenantId: "t-123",
        contact_pk: "contact#abc",
        threadKey: "conv-abc",
        channel: "chat",
        kind: "TYPING_ON",
        persona: "Carlos",
        message_id: "msg-in-001",
        dueAtMs: Date.now()
      }
    ];

    const event = createSQSEvent(actions);
    const result = await handler(event);

    expect(result.batchItemFailures).toHaveLength(0);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  test("handles processing errors gracefully", async () => {
    mockSend.mockRejectedValueOnce(new Error("EventBridge error"));

    const action: ReleaseAction = {
      releaseEventId: "test-id",
      tenantId: "t-123",
      contact_pk: "contact#abc",
      threadKey: "conv-abc",
      channel: "chat",
      kind: "READ",
      message_id: "msg-in-001",
      dueAtMs: Date.now()
    };

    const event = createSQSEvent([action]);
    const result = await handler(event);

    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0].itemIdentifier).toBe("msg-0");
  });

  test("handles invalid JSON gracefully", async () => {
    const event: SQSEvent = {
      Records: [{
        messageId: "msg-0",
        receiptHandle: "receipt-0",
        body: "invalid json",
        attributes: {
          ApproximateReceiveCount: "1",
          SentTimestamp: "1699200000000",
          SenderId: "AIDAIENQZJOLO23YVJ4VO",
          ApproximateFirstReceiveTimestamp: "1699200000000"
        },
        messageAttributes: {},
        md5OfBody: "",
        eventSource: "aws:sqs",
        eventSourceARN: "arn:aws:sqs:us-east-1:123456789012:test-queue.fifo",
        awsRegion: "us-east-1"
      }]
    };

    const result = await handler(event);

    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0].itemIdentifier).toBe("msg-0");
  });
});

export type Channel = "chat" | "sms" | "email" | "api";

export type ActionKind = "READ" | "TYPING_ON" | "TYPING_OFF" | "FINAL";

export interface ReleaseAction {
  releaseEventId: string;   // uuid
  tenantId: string;
  contact_pk: string;
  conversation_id?: string;
  threadKey: string;        // conversation_id || contact_pk
  channel: Channel;
  kind: ActionKind;
  persona?: string;
  replyText?: string;       // only for FINAL
  message_id: string;       // inbound message id
  dueAtMs: number;
}

export interface AgentMessageRead {
  tenantId: string;
  contact_pk: string;
  channel: Channel;
  conversation_id?: string;
  message_id: string;
  timestamps: { at: string };
}

export interface AgentTypingEvent {
  tenantId: string;
  contact_pk: string;
  channel: Channel;
  conversation_id?: string;
  message_id: string;
  persona?: string;
  timestamps: { at: string };
}

export interface AgentReplyCreated {
  tenantId: string;
  contact_pk: string;
  preferredChannel: Channel;
  text: string;
  routing: Record<string, any>;
  conversation_id?: string;
  metadata: Record<string, any>;
  timing?: any;
}

export interface EventBridgeEvent {
  EventBusName: string;
  Source: string;
  DetailType: string;
  Detail: string;
}

export interface SQSBatchItemFailure {
  itemIdentifier: string;
}

export interface SQSBatchResponse {
  batchItemFailures: SQSBatchItemFailure[];
}

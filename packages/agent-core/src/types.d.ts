export type Channel = "chat" | "sms" | "email" | "api";
export interface LeadMessageCreated {
    tenantId: string;
    email_lc?: string;
    phone_e164?: string;
    source: Channel;
    text: string;
    conversation_id?: string;
    timestamps: {
        received: string;
    };
    channel_context?: Record<string, any>;
}
export type ActionKind = "READ" | "TYPING_ON" | "TYPING_OFF" | "FINAL";
export interface ReleaseAction {
    releaseEventId: string;
    tenantId: string;
    contact_pk: string;
    conversation_id?: string;
    threadKey: string;
    channel: Channel;
    kind: ActionKind;
    persona?: string;
    replyText?: string;
    message_id: string;
    dueAtMs: number;
}
export interface Timing {
    read_ms: number;
    comprehension_ms: number;
    write_ms: number;
    type_ms: number;
    jitter_ms: number;
    pauses_ms?: number;
    total_ms: number;
}
export interface AgentMessageRead {
    tenantId: string;
    contact_pk: string;
    channel: Channel;
    conversation_id?: string;
    message_id: string;
    timestamps: {
        at: string;
    };
}
export interface AgentTypingEvent {
    tenantId: string;
    contact_pk: string;
    channel: Channel;
    conversation_id?: string;
    message_id: string;
    persona?: string;
    timestamps: {
        at: string;
    };
}
export interface AgentReplyCreated {
    tenantId: string;
    contact_pk: string;
    preferredChannel: Channel;
    text: string;
    routing: Record<string, any>;
    conversation_id?: string;
    metadata: Record<string, any>;
    timing?: Timing;
}
//# sourceMappingURL=types.d.ts.map
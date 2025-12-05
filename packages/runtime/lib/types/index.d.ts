import { z } from 'zod';
export declare const MessageSourceSchema: z.ZodEnum<["sms", "email", "chat", "api", "agent"]>;
export type MessageSource = z.infer<typeof MessageSourceSchema>;
export declare const MessageDirectionSchema: z.ZodEnum<["inbound", "outbound"]>;
export type MessageDirection = z.infer<typeof MessageDirectionSchema>;
export declare const SmsChannelContextSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    messageId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    from: string;
    to: string;
    messageId?: string | undefined;
}, {
    from: string;
    to: string;
    messageId?: string | undefined;
}>;
export declare const EmailChannelContextSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    msgId: z.ZodOptional<z.ZodString>;
    threadId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    from: string;
    to: string;
    msgId?: string | undefined;
    threadId?: string | undefined;
}, {
    from: string;
    to: string;
    msgId?: string | undefined;
    threadId?: string | undefined;
}>;
export declare const ChatChannelContextSchema: z.ZodObject<{
    sessionId: z.ZodString;
    clientId: z.ZodOptional<z.ZodString>;
    userAgent: z.ZodOptional<z.ZodString>;
    ipAddress: z.ZodOptional<z.ZodString>;
    connectionId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    sessionId: string;
    clientId?: string | undefined;
    userAgent?: string | undefined;
    ipAddress?: string | undefined;
    connectionId?: string | undefined;
}, {
    sessionId: string;
    clientId?: string | undefined;
    userAgent?: string | undefined;
    ipAddress?: string | undefined;
    connectionId?: string | undefined;
}>;
export declare const ChannelContextSchema: z.ZodObject<{
    sms: z.ZodOptional<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        messageId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        from: string;
        to: string;
        messageId?: string | undefined;
    }, {
        from: string;
        to: string;
        messageId?: string | undefined;
    }>>;
    email: z.ZodOptional<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
        msgId: z.ZodOptional<z.ZodString>;
        threadId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        from: string;
        to: string;
        msgId?: string | undefined;
        threadId?: string | undefined;
    }, {
        from: string;
        to: string;
        msgId?: string | undefined;
        threadId?: string | undefined;
    }>>;
    chat: z.ZodOptional<z.ZodObject<{
        sessionId: z.ZodString;
        clientId: z.ZodOptional<z.ZodString>;
        userAgent: z.ZodOptional<z.ZodString>;
        ipAddress: z.ZodOptional<z.ZodString>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        sessionId: string;
        clientId?: string | undefined;
        userAgent?: string | undefined;
        ipAddress?: string | undefined;
        connectionId?: string | undefined;
    }, {
        sessionId: string;
        clientId?: string | undefined;
        userAgent?: string | undefined;
        ipAddress?: string | undefined;
        connectionId?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    sms?: {
        from: string;
        to: string;
        messageId?: string | undefined;
    } | undefined;
    email?: {
        from: string;
        to: string;
        msgId?: string | undefined;
        threadId?: string | undefined;
    } | undefined;
    chat?: {
        sessionId: string;
        clientId?: string | undefined;
        userAgent?: string | undefined;
        ipAddress?: string | undefined;
        connectionId?: string | undefined;
    } | undefined;
}, {
    sms?: {
        from: string;
        to: string;
        messageId?: string | undefined;
    } | undefined;
    email?: {
        from: string;
        to: string;
        msgId?: string | undefined;
        threadId?: string | undefined;
    } | undefined;
    chat?: {
        sessionId: string;
        clientId?: string | undefined;
        userAgent?: string | undefined;
        ipAddress?: string | undefined;
        connectionId?: string | undefined;
    } | undefined;
}>;
export type SmsChannelContext = z.infer<typeof SmsChannelContextSchema>;
export type EmailChannelContext = z.infer<typeof EmailChannelContextSchema>;
export type ChatChannelContext = z.infer<typeof ChatChannelContextSchema>;
export type ChannelContext = z.infer<typeof ChannelContextSchema>;
export declare const MessageItemSchema: z.ZodObject<{
    contact_pk: z.ZodString;
    ts: z.ZodString;
    tenantId: z.ZodString;
    email_lc: z.ZodString;
    lead_id: z.ZodOptional<z.ZodString>;
    source: z.ZodEnum<["sms", "email", "chat", "api", "agent"]>;
    direction: z.ZodEnum<["inbound", "outbound"]>;
    channel_context: z.ZodOptional<z.ZodObject<{
        sms: z.ZodOptional<z.ZodObject<{
            from: z.ZodString;
            to: z.ZodString;
            messageId: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            from: string;
            to: string;
            messageId?: string | undefined;
        }, {
            from: string;
            to: string;
            messageId?: string | undefined;
        }>>;
        email: z.ZodOptional<z.ZodObject<{
            from: z.ZodString;
            to: z.ZodString;
            msgId: z.ZodOptional<z.ZodString>;
            threadId: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            from: string;
            to: string;
            msgId?: string | undefined;
            threadId?: string | undefined;
        }, {
            from: string;
            to: string;
            msgId?: string | undefined;
            threadId?: string | undefined;
        }>>;
        chat: z.ZodOptional<z.ZodObject<{
            sessionId: z.ZodString;
            clientId: z.ZodOptional<z.ZodString>;
            userAgent: z.ZodOptional<z.ZodString>;
            ipAddress: z.ZodOptional<z.ZodString>;
            connectionId: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            sessionId: string;
            clientId?: string | undefined;
            userAgent?: string | undefined;
            ipAddress?: string | undefined;
            connectionId?: string | undefined;
        }, {
            sessionId: string;
            clientId?: string | undefined;
            userAgent?: string | undefined;
            ipAddress?: string | undefined;
            connectionId?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        sms?: {
            from: string;
            to: string;
            messageId?: string | undefined;
        } | undefined;
        email?: {
            from: string;
            to: string;
            msgId?: string | undefined;
            threadId?: string | undefined;
        } | undefined;
        chat?: {
            sessionId: string;
            clientId?: string | undefined;
            userAgent?: string | undefined;
            ipAddress?: string | undefined;
            connectionId?: string | undefined;
        } | undefined;
    }, {
        sms?: {
            from: string;
            to: string;
            messageId?: string | undefined;
        } | undefined;
        email?: {
            from: string;
            to: string;
            msgId?: string | undefined;
            threadId?: string | undefined;
        } | undefined;
        chat?: {
            sessionId: string;
            clientId?: string | undefined;
            userAgent?: string | undefined;
            ipAddress?: string | undefined;
            connectionId?: string | undefined;
        } | undefined;
    }>>;
    text: z.ZodString;
    attachments: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    meta: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    conversation_id: z.ZodOptional<z.ZodString>;
    targetKey: z.ZodOptional<z.ZodString>;
    dateReceived: z.ZodOptional<z.ZodString>;
    GSI1PK: z.ZodOptional<z.ZodString>;
    GSI1SK: z.ZodOptional<z.ZodString>;
    GSI2PK: z.ZodOptional<z.ZodString>;
    GSI2SK: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    text: string;
    contact_pk: string;
    ts: string;
    tenantId: string;
    email_lc: string;
    source: "sms" | "email" | "chat" | "api" | "agent";
    direction: "inbound" | "outbound";
    conversation_id?: string | undefined;
    lead_id?: string | undefined;
    channel_context?: {
        sms?: {
            from: string;
            to: string;
            messageId?: string | undefined;
        } | undefined;
        email?: {
            from: string;
            to: string;
            msgId?: string | undefined;
            threadId?: string | undefined;
        } | undefined;
        chat?: {
            sessionId: string;
            clientId?: string | undefined;
            userAgent?: string | undefined;
            ipAddress?: string | undefined;
            connectionId?: string | undefined;
        } | undefined;
    } | undefined;
    meta?: Record<string, any> | undefined;
    GSI1PK?: string | undefined;
    GSI1SK?: string | undefined;
    GSI2PK?: string | undefined;
    GSI2SK?: string | undefined;
    attachments?: string[] | undefined;
    targetKey?: string | undefined;
    dateReceived?: string | undefined;
}, {
    text: string;
    contact_pk: string;
    ts: string;
    tenantId: string;
    email_lc: string;
    source: "sms" | "email" | "chat" | "api" | "agent";
    direction: "inbound" | "outbound";
    conversation_id?: string | undefined;
    lead_id?: string | undefined;
    channel_context?: {
        sms?: {
            from: string;
            to: string;
            messageId?: string | undefined;
        } | undefined;
        email?: {
            from: string;
            to: string;
            msgId?: string | undefined;
            threadId?: string | undefined;
        } | undefined;
        chat?: {
            sessionId: string;
            clientId?: string | undefined;
            userAgent?: string | undefined;
            ipAddress?: string | undefined;
            connectionId?: string | undefined;
        } | undefined;
    } | undefined;
    meta?: Record<string, any> | undefined;
    GSI1PK?: string | undefined;
    GSI1SK?: string | undefined;
    GSI2PK?: string | undefined;
    GSI2SK?: string | undefined;
    attachments?: string[] | undefined;
    targetKey?: string | undefined;
    dateReceived?: string | undefined;
}>;
export type MessageItem = z.infer<typeof MessageItemSchema>;
export declare const LeadItemSchema: z.ZodObject<{
    PK: z.ZodString;
    SK: z.ZodString;
    lead_id: z.ZodString;
    email: z.ZodString;
    email_lc: z.ZodString;
    phone_e164: z.ZodOptional<z.ZodString>;
    preferences: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    email: string;
    email_lc: string;
    lead_id: string;
    PK: string;
    SK: string;
    preferences?: Record<string, any> | undefined;
    phone_e164?: string | undefined;
}, {
    email: string;
    email_lc: string;
    lead_id: string;
    PK: string;
    SK: string;
    preferences?: Record<string, any> | undefined;
    phone_e164?: string | undefined;
}>;
export type LeadItem = z.infer<typeof LeadItemSchema>;
export declare const InboundMessageEventSchema: z.ZodObject<{
    source: z.ZodLiteral<"kxgen.messaging">;
    'detail-type': z.ZodLiteral<"lead.message.created">;
    detail: z.ZodObject<{
        tenantId: z.ZodString;
        email_lc: z.ZodOptional<z.ZodString>;
        phone_e164: z.ZodOptional<z.ZodString>;
        lead_id: z.ZodOptional<z.ZodString>;
        source: z.ZodEnum<["sms", "email", "chat", "api", "agent"]>;
        text: z.ZodString;
        conversation_id: z.ZodOptional<z.ZodString>;
        provider: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
        timestamps: z.ZodObject<{
            received: z.ZodString;
            processed: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            received: string;
            processed?: string | undefined;
        }, {
            received: string;
            processed?: string | undefined;
        }>;
        channel_context: z.ZodOptional<z.ZodObject<{
            sms: z.ZodOptional<z.ZodObject<{
                from: z.ZodString;
                to: z.ZodString;
                messageId: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                from: string;
                to: string;
                messageId?: string | undefined;
            }, {
                from: string;
                to: string;
                messageId?: string | undefined;
            }>>;
            email: z.ZodOptional<z.ZodObject<{
                from: z.ZodString;
                to: z.ZodString;
                msgId: z.ZodOptional<z.ZodString>;
                threadId: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                from: string;
                to: string;
                msgId?: string | undefined;
                threadId?: string | undefined;
            }, {
                from: string;
                to: string;
                msgId?: string | undefined;
                threadId?: string | undefined;
            }>>;
            chat: z.ZodOptional<z.ZodObject<{
                sessionId: z.ZodString;
                clientId: z.ZodOptional<z.ZodString>;
                userAgent: z.ZodOptional<z.ZodString>;
                ipAddress: z.ZodOptional<z.ZodString>;
                connectionId: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                sessionId: string;
                clientId?: string | undefined;
                userAgent?: string | undefined;
                ipAddress?: string | undefined;
                connectionId?: string | undefined;
            }, {
                sessionId: string;
                clientId?: string | undefined;
                userAgent?: string | undefined;
                ipAddress?: string | undefined;
                connectionId?: string | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            sms?: {
                from: string;
                to: string;
                messageId?: string | undefined;
            } | undefined;
            email?: {
                from: string;
                to: string;
                msgId?: string | undefined;
                threadId?: string | undefined;
            } | undefined;
            chat?: {
                sessionId: string;
                clientId?: string | undefined;
                userAgent?: string | undefined;
                ipAddress?: string | undefined;
                connectionId?: string | undefined;
            } | undefined;
        }, {
            sms?: {
                from: string;
                to: string;
                messageId?: string | undefined;
            } | undefined;
            email?: {
                from: string;
                to: string;
                msgId?: string | undefined;
                threadId?: string | undefined;
            } | undefined;
            chat?: {
                sessionId: string;
                clientId?: string | undefined;
                userAgent?: string | undefined;
                ipAddress?: string | undefined;
                connectionId?: string | undefined;
            } | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        text: string;
        tenantId: string;
        source: "sms" | "email" | "chat" | "api" | "agent";
        timestamps: {
            received: string;
            processed?: string | undefined;
        };
        email_lc?: string | undefined;
        conversation_id?: string | undefined;
        lead_id?: string | undefined;
        channel_context?: {
            sms?: {
                from: string;
                to: string;
                messageId?: string | undefined;
            } | undefined;
            email?: {
                from: string;
                to: string;
                msgId?: string | undefined;
                threadId?: string | undefined;
            } | undefined;
            chat?: {
                sessionId: string;
                clientId?: string | undefined;
                userAgent?: string | undefined;
                ipAddress?: string | undefined;
                connectionId?: string | undefined;
            } | undefined;
        } | undefined;
        phone_e164?: string | undefined;
        provider?: Record<string, any> | undefined;
    }, {
        text: string;
        tenantId: string;
        source: "sms" | "email" | "chat" | "api" | "agent";
        timestamps: {
            received: string;
            processed?: string | undefined;
        };
        email_lc?: string | undefined;
        conversation_id?: string | undefined;
        lead_id?: string | undefined;
        channel_context?: {
            sms?: {
                from: string;
                to: string;
                messageId?: string | undefined;
            } | undefined;
            email?: {
                from: string;
                to: string;
                msgId?: string | undefined;
                threadId?: string | undefined;
            } | undefined;
            chat?: {
                sessionId: string;
                clientId?: string | undefined;
                userAgent?: string | undefined;
                ipAddress?: string | undefined;
                connectionId?: string | undefined;
            } | undefined;
        } | undefined;
        phone_e164?: string | undefined;
        provider?: Record<string, any> | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    source: "kxgen.messaging";
    'detail-type': "lead.message.created";
    detail: {
        text: string;
        tenantId: string;
        source: "sms" | "email" | "chat" | "api" | "agent";
        timestamps: {
            received: string;
            processed?: string | undefined;
        };
        email_lc?: string | undefined;
        conversation_id?: string | undefined;
        lead_id?: string | undefined;
        channel_context?: {
            sms?: {
                from: string;
                to: string;
                messageId?: string | undefined;
            } | undefined;
            email?: {
                from: string;
                to: string;
                msgId?: string | undefined;
                threadId?: string | undefined;
            } | undefined;
            chat?: {
                sessionId: string;
                clientId?: string | undefined;
                userAgent?: string | undefined;
                ipAddress?: string | undefined;
                connectionId?: string | undefined;
            } | undefined;
        } | undefined;
        phone_e164?: string | undefined;
        provider?: Record<string, any> | undefined;
    };
}, {
    source: "kxgen.messaging";
    'detail-type': "lead.message.created";
    detail: {
        text: string;
        tenantId: string;
        source: "sms" | "email" | "chat" | "api" | "agent";
        timestamps: {
            received: string;
            processed?: string | undefined;
        };
        email_lc?: string | undefined;
        conversation_id?: string | undefined;
        lead_id?: string | undefined;
        channel_context?: {
            sms?: {
                from: string;
                to: string;
                messageId?: string | undefined;
            } | undefined;
            email?: {
                from: string;
                to: string;
                msgId?: string | undefined;
                threadId?: string | undefined;
            } | undefined;
            chat?: {
                sessionId: string;
                clientId?: string | undefined;
                userAgent?: string | undefined;
                ipAddress?: string | undefined;
                connectionId?: string | undefined;
            } | undefined;
        } | undefined;
        phone_e164?: string | undefined;
        provider?: Record<string, any> | undefined;
    };
}>;
export declare const AgentReplyEventSchema: z.ZodObject<{
    source: z.ZodLiteral<"kxgen.agent">;
    'detail-type': z.ZodLiteral<"agent.reply.created">;
    detail: z.ZodObject<{
        tenantId: z.ZodString;
        contact_pk: z.ZodString;
        preferredChannel: z.ZodEnum<["sms", "email", "chat", "api", "agent"]>;
        text: z.ZodString;
        routing: z.ZodObject<{
            sms: z.ZodOptional<z.ZodObject<{
                to: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                to: string;
            }, {
                to: string;
            }>>;
            email: z.ZodOptional<z.ZodObject<{
                to: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                to: string;
            }, {
                to: string;
            }>>;
            chat: z.ZodOptional<z.ZodObject<{
                sessionId: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                sessionId: string;
            }, {
                sessionId: string;
            }>>;
        }, "strip", z.ZodTypeAny, {
            sms?: {
                to: string;
            } | undefined;
            email?: {
                to: string;
            } | undefined;
            chat?: {
                sessionId: string;
            } | undefined;
        }, {
            sms?: {
                to: string;
            } | undefined;
            email?: {
                to: string;
            } | undefined;
            chat?: {
                sessionId: string;
            } | undefined;
        }>;
        conversation_id: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        text: string;
        contact_pk: string;
        tenantId: string;
        preferredChannel: "sms" | "email" | "chat" | "api" | "agent";
        routing: {
            sms?: {
                to: string;
            } | undefined;
            email?: {
                to: string;
            } | undefined;
            chat?: {
                sessionId: string;
            } | undefined;
        };
        conversation_id?: string | undefined;
        metadata?: Record<string, any> | undefined;
    }, {
        text: string;
        contact_pk: string;
        tenantId: string;
        preferredChannel: "sms" | "email" | "chat" | "api" | "agent";
        routing: {
            sms?: {
                to: string;
            } | undefined;
            email?: {
                to: string;
            } | undefined;
            chat?: {
                sessionId: string;
            } | undefined;
        };
        conversation_id?: string | undefined;
        metadata?: Record<string, any> | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    source: "kxgen.agent";
    'detail-type': "agent.reply.created";
    detail: {
        text: string;
        contact_pk: string;
        tenantId: string;
        preferredChannel: "sms" | "email" | "chat" | "api" | "agent";
        routing: {
            sms?: {
                to: string;
            } | undefined;
            email?: {
                to: string;
            } | undefined;
            chat?: {
                sessionId: string;
            } | undefined;
        };
        conversation_id?: string | undefined;
        metadata?: Record<string, any> | undefined;
    };
}, {
    source: "kxgen.agent";
    'detail-type': "agent.reply.created";
    detail: {
        text: string;
        contact_pk: string;
        tenantId: string;
        preferredChannel: "sms" | "email" | "chat" | "api" | "agent";
        routing: {
            sms?: {
                to: string;
            } | undefined;
            email?: {
                to: string;
            } | undefined;
            chat?: {
                sessionId: string;
            } | undefined;
        };
        conversation_id?: string | undefined;
        metadata?: Record<string, any> | undefined;
    };
}>;
export declare const AgentErrorEventSchema: z.ZodObject<{
    source: z.ZodLiteral<"kxgen.agent">;
    'detail-type': z.ZodLiteral<"agent.error">;
    detail: z.ZodObject<{
        tenantId: z.ZodString;
        contact_pk: z.ZodOptional<z.ZodString>;
        error: z.ZodString;
        stack: z.ZodOptional<z.ZodString>;
        context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        tenantId: string;
        error: string;
        contact_pk?: string | undefined;
        stack?: string | undefined;
        context?: Record<string, any> | undefined;
    }, {
        tenantId: string;
        error: string;
        contact_pk?: string | undefined;
        stack?: string | undefined;
        context?: Record<string, any> | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    source: "kxgen.agent";
    'detail-type': "agent.error";
    detail: {
        tenantId: string;
        error: string;
        contact_pk?: string | undefined;
        stack?: string | undefined;
        context?: Record<string, any> | undefined;
    };
}, {
    source: "kxgen.agent";
    'detail-type': "agent.error";
    detail: {
        tenantId: string;
        error: string;
        contact_pk?: string | undefined;
        stack?: string | undefined;
        context?: Record<string, any> | undefined;
    };
}>;
export declare const AgentTraceEventSchema: z.ZodObject<{
    source: z.ZodLiteral<"kxgen.agent">;
    'detail-type': z.ZodLiteral<"agent.trace">;
    detail: z.ZodObject<{
        tenantId: z.ZodString;
        contact_pk: z.ZodOptional<z.ZodString>;
        operation: z.ZodString;
        duration_ms: z.ZodOptional<z.ZodNumber>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, "strip", z.ZodTypeAny, {
        tenantId: string;
        operation: string;
        contact_pk?: string | undefined;
        metadata?: Record<string, any> | undefined;
        duration_ms?: number | undefined;
    }, {
        tenantId: string;
        operation: string;
        contact_pk?: string | undefined;
        metadata?: Record<string, any> | undefined;
        duration_ms?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    source: "kxgen.agent";
    'detail-type': "agent.trace";
    detail: {
        tenantId: string;
        operation: string;
        contact_pk?: string | undefined;
        metadata?: Record<string, any> | undefined;
        duration_ms?: number | undefined;
    };
}, {
    source: "kxgen.agent";
    'detail-type': "agent.trace";
    detail: {
        tenantId: string;
        operation: string;
        contact_pk?: string | undefined;
        metadata?: Record<string, any> | undefined;
        duration_ms?: number | undefined;
    };
}>;
export type InboundMessageEvent = z.infer<typeof InboundMessageEventSchema>;
export type AgentReplyEvent = z.infer<typeof AgentReplyEventSchema>;
export type AgentErrorEvent = z.infer<typeof AgentErrorEventSchema>;
export type AgentTraceEvent = z.infer<typeof AgentTraceEventSchema>;
export interface AgentContext {
    tenantId: string;
    email_lc: string;
    text: string;
    source: MessageSource;
    channel_context?: ChannelContext;
    lead_id?: string;
    conversation_id?: string;
    channelId?: string;
    userId?: string;
    senderId?: string;
    userName?: string;
    connectionId?: string;
}
export interface RuntimeConfig {
    messagesTable: string;
    leadsTable: string;
    personasTable?: string;
    bedrockModelId: string;
    outboundEventBusName?: string;
    outboundEventBusArn?: string;
    eventBusPutEventsRoleArn?: string;
    ragIndexNamePrefix?: string;
    historyLimit: number;
    awsRegion: string;
    dynamodbEndpoint?: string;
}
export interface AgentResponse {
    success: boolean;
    message: string;
    intent?: {
        id: string;
        name: string;
        confidence: number;
        priority: string;
        matchedTriggers: string[];
        matchedPatterns: string[];
        actions?: string[];
    };
    metadata: {
        sessionId: string;
        tenantId: string;
        userId?: string;
        channel?: string;
        timestamp: string;
        processingTimeMs: number;
        totalProcessingTimeMs?: number;
        responseChunks?: number;
        personaId?: string;
        companyName?: string;
    };
    followUp?: string[];
    error?: {
        code: string;
        message: string;
        details?: any;
    };
}
export type { ChannelWorkflowState, ChannelItem } from "./dynamodb-schemas.js";

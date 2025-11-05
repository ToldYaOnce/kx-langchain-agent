import { Channel, Timing } from "./types";
import { PERSONAS, PersonaTiming } from "./personaTimings";
export declare function computeTiming(seedKey: string, persona: PersonaTiming, inputChars: number, inputTokens: number, replyChars: number): Timing;
export declare function scheduleActions(params: {
    queueUrl: string;
    tenantId: string;
    contact_pk: string;
    conversation_id?: string;
    channel: Channel;
    personaName: keyof typeof PERSONAS;
    message_id: string;
    replyText: string;
    inputChars: number;
    inputTokens: number;
}): Promise<Timing>;
/**
 * Estimates token count using a simple heuristic
 * More accurate tokenizers can be plugged in here
 */
export declare function estimateTokenCount(text: string): number;
//# sourceMappingURL=composeAndSchedule.d.ts.map
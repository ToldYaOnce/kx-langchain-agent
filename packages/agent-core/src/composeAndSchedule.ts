import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { randomUUID } from "crypto";
import { ActionKind, Channel, ReleaseAction, Timing } from "./types";
import { PERSONAS, PersonaTiming } from "./personaTimings";

const sqs = new SQSClient({});

function prng(seed: number) {
  return () => (seed = Math.imul(48271, seed) % 2147483647) / 2147483647;
}

function sample(r: () => number, [lo, hi]: [number, number]) {
  return Math.round(lo + r() * (hi - lo));
}

export function computeTiming(
  seedKey: string, 
  persona: PersonaTiming, 
  inputChars: number, 
  inputTokens: number, 
  replyChars: number
): Timing {
  // Simple seed generation from string
  let seed = 1;
  for (let i = 0; i < seedKey.length; i++) {
    seed = (seed * 31 + seedKey.charCodeAt(i)) >>> 0;
  }
  
  const r = prng(seed || 1);

  const read = Math.ceil(inputChars / sample(r, persona.read_cps)) * 1000;
  const comp = sample(r, persona.comp_base_ms) + inputTokens * sample(r, persona.comp_ms_per_token);
  const write = replyChars * sample(r, persona.write_ms_per_char);
  const type = Math.ceil(replyChars / sample(r, persona.type_cps)) * 1000;
  const jitter = sample(r, persona.jitter_ms);

  let pauses_ms = 0;
  if (persona.pauses && Math.random() < persona.pauses.prob) {
    const n = 1 + Math.floor(Math.random() * persona.pauses.max);
    for (let i = 0; i < n; i++) {
      pauses_ms += sample(Math.random, persona.pauses.each_ms);
    }
  }

  const total = read + comp + write + type + jitter + pauses_ms;

  // Caps for web chat UX
  return {
    read_ms: Math.max(700, read),
    comprehension_ms: comp,
    write_ms: write,
    type_ms: type,
    jitter_ms: jitter,
    pauses_ms,
    total_ms: Math.min(total, 45_000)
  };
}

export async function scheduleActions(params: {
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
}): Promise<Timing> {
  const { 
    queueUrl, 
    tenantId, 
    contact_pk, 
    conversation_id, 
    channel, 
    personaName, 
    message_id, 
    replyText, 
    inputChars, 
    inputTokens 
  } = params;

  const persona = PERSONAS[personaName];
  if (!persona) {
    throw new Error(`Unknown persona: ${personaName}`);
  }

  const threadKey = conversation_id || contact_pk;
  const seedKey = `${tenantId}:${threadKey}:${message_id}`;
  const replyChars = replyText.length;

  const t = computeTiming(seedKey, persona, inputChars, inputTokens, replyChars);
  const now = Date.now();

  const actions: Array<{ kind: ActionKind; at: number; includeText?: boolean }> = [];

  if (channel === "chat") {
    actions.push({ kind: "READ", at: now + t.read_ms });
    actions.push({ kind: "TYPING_ON", at: now + t.read_ms + 300 });
    actions.push({ kind: "TYPING_OFF", at: now + t.total_ms - 250 });
    actions.push({ kind: "FINAL", at: now + t.total_ms, includeText: true });
  } else {
    // sms/email/api: final only
    actions.push({ kind: "FINAL", at: now + t.total_ms, includeText: true });
  }

  for (const a of actions) {
    const act: ReleaseAction = {
      releaseEventId: randomUUID(),
      tenantId,
      contact_pk,
      conversation_id,
      threadKey,
      channel,
      kind: a.kind,
      persona: personaName,
      replyText: a.includeText ? replyText : undefined,
      message_id,
      dueAtMs: a.at
    };

    const delaySec = Math.min(15 * 60, Math.max(0, Math.floor((a.at - Date.now()) / 1000)));

    await sqs.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(act),
      DelaySeconds: delaySec,
      // FIFO required for per-thread ordering
      MessageGroupId: `${tenantId}#${threadKey}`,
      MessageDeduplicationId: `${act.releaseEventId}:${a.kind}`
    }));
  }

  // Return timing for telemetry
  return t;
}

/**
 * Estimates token count using a simple heuristic
 * More accurate tokenizers can be plugged in here
 */
export function estimateTokenCount(text: string): number {
  // Rough approximation: ~4 characters per token for English
  return Math.ceil(text.length / 4);
}

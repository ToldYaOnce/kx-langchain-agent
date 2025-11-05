import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { SQSEvent, SQSBatchResponse } from "aws-lambda";
import { ReleaseAction } from "./types";

const eb = new EventBridgeClient({});
const BUS_NAME = process.env.EVENT_BUS_NAME || "default";

function putEvent(detailType: string, detail: any) {
  return eb.send(new PutEventsCommand({
    Entries: [{
      EventBusName: BUS_NAME,
      Source: "kxgen.agent",
      DetailType: detailType,
      Detail: JSON.stringify(detail)
    }]
  }));
}

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const failures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      const action = JSON.parse(record.body) as ReleaseAction;
      const timestamp = new Date().toISOString();

      if (action.kind === "READ") {
        await putEvent("agent.message.read", {
          tenantId: action.tenantId,
          contact_pk: action.contact_pk,
          channel: action.channel,
          conversation_id: action.conversation_id,
          message_id: action.message_id,
          timestamps: { at: timestamp }
        });

      } else if (action.kind === "TYPING_ON") {
        await putEvent("agent.typing.started", {
          tenantId: action.tenantId,
          contact_pk: action.contact_pk,
          channel: action.channel,
          conversation_id: action.conversation_id,
          message_id: action.message_id,
          persona: action.persona,
          timestamps: { at: timestamp }
        });

      } else if (action.kind === "TYPING_OFF") {
        await putEvent("agent.typing.stopped", {
          tenantId: action.tenantId,
          contact_pk: action.contact_pk,
          channel: action.channel,
          conversation_id: action.conversation_id,
          message_id: action.message_id,
          persona: action.persona,
          timestamps: { at: timestamp }
        });

      } else if (action.kind === "FINAL") {
        await putEvent("agent.reply.created", {
          tenantId: action.tenantId,
          contact_pk: action.contact_pk,
          preferredChannel: action.channel,
          text: action.replyText,
          routing: {},
          conversation_id: action.conversation_id,
          metadata: {},
          timing: {} // Optional: could include timing metadata if needed
        });

      } else {
        console.warn(`Unknown action kind: ${action.kind}`);
      }

      console.log(`Successfully processed ${action.kind} action for ${action.tenantId}/${action.threadKey}`);

    } catch (error) {
      console.error(`Failed to process SQS record ${record.messageId}:`, error);
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  if (failures.length > 0) {
    console.log(`Batch processing completed with ${failures.length} failures`);
  }

  return { batchItemFailures: failures };
};

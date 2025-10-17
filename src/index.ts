import { SQSClient, ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import dotenv from "dotenv";
import { S3Event } from "aws-lambda";

dotenv.config();

// Log credentials check (masked for security)
console.log("=== CREDENTIALS CHECK ===");
console.log("AWS_REGION:", process.env.AWS_REGION);
console.log(
  "AWS_ACCESS_KEY_ID:",
  process.env.AWS_ACCESS_KEY_ID ? "***SET***" : "NOT SET"
);
console.log(
  "AWS_SECRET_ACCESS_KEY:",
  process.env.AWS_SECRET_ACCESS_KEY ? "***SET***" : "NOT SET"
);
console.log("SQS_QUEUE_URL:", process.env.SQS_QUEUE_URL);
console.log("========================");

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function main() {
  console.log("Starting SQS polling...");

  const command = new ReceiveMessageCommand({
    QueueUrl: process.env.SQS_QUEUE_URL!,
    MaxNumberOfMessages: 1,
    WaitTimeSeconds: 20,
  });

  while (true) {
    try {
      console.log("Polling for messages...");
      const response = await sqsClient.send(command);
      const { Messages } = response;

      console.log("SQS Response received:", {
        messageCount: Messages?.length || 0,
        hasMessages: !!(Messages && Messages.length > 0),
      });

      if (!Messages || Messages.length === 0) {
        console.log("No messages found, continuing to poll...");
        continue;
      }

      for (const message of Messages) {
        const { MessageId, Body } = message;
        console.log(`Processing message ${MessageId}`);
        console.log(`Body: ${Body}`);

        if (!Body) {
          console.error(`Message ${MessageId} has no body`);
          continue;
        }
        const event = JSON.parse(Body) as S3Event;
        if ("Service" in event && "Event" in message) {
          if (message.Event === "s3:TestEvent") {
            console.log("Test event received");
            continue;
          }
        }

        for (const record of event.Records) {
          const { s3 } = record;
          const {
            bucket,
            object: { key },
          } = s3;
        }

        // Spin the docker container with the event
      }
    } catch (error) {
      console.error("Error in SQS polling:", error);
      console.log("Waiting 5 seconds before retry...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

main();

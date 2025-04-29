import { RedisClient } from "jsr:@iuioiua/redis";
import { z } from "npm:zod";

import {
  TransactionSchema,
  MessageQueueNamingSchema,
} from "./utils/schemas.ts";

// Set up Redis client
// https://docs.deno.com/examples/redis/
const redisPort = Number(Deno.env.get("REDIS_PORT")) || 6379;
const redisConn = await Deno.connect({ port: redisPort });
const redisClient = new RedisClient(redisConn);
await redisClient.sendCommand([
  "AUTH",
  Deno.env.get("REDIS_USERNAME") || "default",
  Deno.env.get("REDIS_PASSWORD") || "message_queue_password",
]);
await redisClient.sendCommand(["FLUSHDB"]); // Clear the database

const QUEUES_SET_NAME = "message_queues"; // Set name to store all queues in Redis

// Redis Queue - FIFO
// https://redis.io/glossary/redis-queue/

// Server handler
const handler = async (req: Request): Promise<Response> => {
  const { pathname } = new URL(req.url);

  // Welcome message
  if (pathname === "/" && req.method === "GET") {
    return new Response("Hello from message queue service!", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // `/push` message queue endpoint
  // - adds a new message to the queue and appends it to its end.
  // - The message should include all the data fields defined in Assignment 2 for the transactions or the results table in the transaction service
  if (pathname === "/push" && req.method === "POST") {
    const body = await req.json();
    // Check if message queue exists
    const queueExists = await redisClient.sendCommand([
      "SISMEMBER",
      QUEUES_SET_NAME,
      body.queue_name,
    ]);
    console.log("Queue exists:", queueExists);
    if (!queueExists) {
      return new Response(
        JSON.stringify({
          error: "Queue does not exist",
          message: `Queue ${body.queue_name} does not exist`,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    // Check if the message is valid
    try {
      TransactionSchema.parse(body.message); // Validate the message against the schema
    } catch (e) {
      if (e instanceof z.ZodError) {
        return new Response(
          JSON.stringify({
            error: "Invalid message format",
            message: e.errors,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      } else {
        return new Response(
          JSON.stringify({
            error: "Invalid message format",
            message: "Unknown error",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }
    // Now we can push the message to the queue - it exists and is valid
    console.log("Pushing message to queue:", JSON.stringify(body.message));
    const result = await redisClient.sendCommand([
      "LPUSH",
      body.queue_name,
      JSON.stringify(body.message),
    ]);
    if (typeof result === "number" && result > 0) {
      return new Response(
        JSON.stringify({
          message: `Message has been added to queue ${body.queue_name}`,
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }
      );
    } else {
      console.error("Failed to add message to queue", result);
      return new Response(
        JSON.stringify({ message: "Failed to add message to queue" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  // `/pull` message queue endpoint
  // - removes the first (oldest) message from the queue
  // - and returns its contents to the caller
  if (pathname === "/pull" && req.method === "GET") {
    const url = new URL(req.url);
    const queueName = url.searchParams.get("queue-name");

    // Validate the queue name
    if (!queueName) {
      return new Response(
        JSON.stringify({
          error: "Queue name is required",
          message: "Queue name is missing",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    try {
      MessageQueueNamingSchema.parse({ name: queueName });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return new Response(
          JSON.stringify({
            error: "Invalid message queue name format",
            message: e.errors,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      } else {
        return new Response(
          JSON.stringify({
            error: "Invalid name format",
            message: "Unknown error",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Check if the queue exists
    const queueExists = await redisClient.sendCommand([
      "SISMEMBER",
      QUEUES_SET_NAME,
      queueName,
    ]);
    console.log("Queue exists:", queueExists);
    if (!queueExists) {
      return new Response(
        JSON.stringify({
          error: "Queue does not exist",
          message: `Queue ${queueName} does not exist`,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get the first message from the queue
    const message = await redisClient.sendCommand(["RPOP", queueName]);
    if (!message) {
      // Redis returns null if the queue is empty
      return new Response(
        JSON.stringify({ message: "No messages in the queue" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    console.log("Pulled message:", message);
    return new Response(
      message as string, // It is already a stringified JSON
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // `/list` message queue endpoint
  // - lists all messages in the queue
  // - and returns their contents to the caller
  if (pathname === "/list" && req.method === "GET") {
    const url = new URL(req.url);
    const queueName = url.searchParams.get("queue-name");

    // Validate the queue name
    if (!queueName) {
      return new Response(
        JSON.stringify({
          error: "Queue name is required",
          message: "Queue name is missing",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    try {
      MessageQueueNamingSchema.parse({ name: queueName });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return new Response(
          JSON.stringify({
            error: "Invalid message queue name format",
            message: e.errors,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      } else {
        return new Response(
          JSON.stringify({
            error: "Invalid name format",
            message: "Unknown error",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Check if the queue exists
    const queueExists = await redisClient.sendCommand([
      "SISMEMBER",
      QUEUES_SET_NAME,
      queueName,
    ]);
    console.log("Queue exists:", queueExists);
    if (!queueExists) {
      return new Response(
        JSON.stringify({
          error: "Queue does not exist",
          message: `Queue ${queueName} does not exist`,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Simulate listing messages in the queue
    const messages = (await redisClient.sendCommand([
      "LRANGE",
      queueName,
      0,
      -1,
    ])) as string[];
    // Parse the messages to JSON
    const parsed_messages = messages.map((msg) => JSON.parse(msg));
    console.log("Listed messages:", parsed_messages);
    return new Response(JSON.stringify({ data: parsed_messages }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // `/create` message queue endpoint
  // - creates a new message queue
  // - only `administrator role can create a new message queue
  if (pathname === "/create" && req.method === "POST") {
    const body = await req.json();
    try {
      MessageQueueNamingSchema.parse(body);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return new Response(
          JSON.stringify({
            error: "Invalid message queue name format",
            message: e.errors,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      } else {
        return new Response(
          JSON.stringify({
            error: "Invalid name format",
            message: "Unknown error",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }
    const queueName = body.name;
    // Check if the queue already exists
    const queueExists = await redisClient.sendCommand([
      "SISMEMBER",
      QUEUES_SET_NAME,
      queueName,
    ]);
    console.log("Queue exists:", queueExists);
    if (queueExists) {
      return new Response(
        JSON.stringify({
          error: "Queue already exists",
          message: `Queue ${queueName} already exists`,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    } else {
      // Create the queue
      await redisClient.sendCommand(["SADD", QUEUES_SET_NAME, queueName]);
      console.log("Created queue:", queueName);
      return new Response(
        JSON.stringify({ message: `Queue ${queueName} created` }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // `/delete` message queue endpoint
  // - deletes a message queue
  // - when deleting a queue, all messages in the queue will be deleted as well
  // - only `administrator role can delete a message queue
  if (pathname === "/delete" && req.method === "DELETE") {
    const body = await req.json();
    try {
      MessageQueueNamingSchema.parse(body);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return new Response(
          JSON.stringify({
            error: "Invalid message queue name format",
            message: e.errors,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      } else {
        return new Response(
          JSON.stringify({
            error: "Invalid name format",
            message: "Unknown error",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }
    const queueName = body.name;
    // Check if the queue exists
    const queueExists = await redisClient.sendCommand([
      "SISMEMBER",
      QUEUES_SET_NAME,
      queueName,
    ]);
    if (!queueExists) {
      return new Response(
        JSON.stringify({
          error: "Queue does not exist",
          message: `Queue ${queueName} does not exist`,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    // Delete the queue
    await redisClient.sendCommand(["SREM", QUEUES_SET_NAME, queueName]);
    await redisClient.sendCommand(["DEL", queueName]);
    console.log("Deleted queue:", queueName);
    return new Response(
      JSON.stringify({ message: `Queue ${queueName} deleted` }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // `/docs` endpoint
  if (pathname === "/docs" && req.method === "GET") {
    try {
      const yamlContent = await Deno.readTextFile("./openapi.yaml");
      return new Response(yamlContent, {
        status: 200,
        headers: { "Content-Type": "application/yaml" },
      });
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        return new Response(
          JSON.stringify({
            error: "Unable to load openapi.yaml",
            message: e.message,
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      } else {
        return new Response(
          JSON.stringify({
            error: "Unable to load openapi.yaml",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }
  }

  // `/ui` endpoint
  if (pathname === "/ui" && req.method === "GET") {
    try {
      return new Response(
        `
        <!doctype html>
        <html>
          <head>
            <title>Scalar API Reference</title>
            <meta charset="utf-8" />
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1" />
          </head>
          <body>
            <!-- Need a Custom Header? Check out this example https://codepen.io/scalarorg/pen/VwOXqam -->
            <script
              id="api-reference"
              data-url="http://localhost:${
                Deno.env.get("MESSAGE_QUEUE_SERVICE_PORT") || 8004
              }/docs"></script>
            <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
          </body>
        </html>
        `,
        {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }
      );
    } catch (e) {
      if (e instanceof Error) {
        return new Response(
          JSON.stringify({
            error: "Unable to load Scalar UI",
            message: e.message,
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      } else {
        return new Response(
          JSON.stringify({
            error: "Unable to load Scalar UI",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }
  }

  // Default response
  return new Response(`Path: "${pathname}" not found`, { status: 404 });
};

// Logger middleware
function loggerMiddleware(
  handler: (req: Request) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    // Log source (if available via header), destination, headers, etc.
    const { method, url } = req;
    const parsedUrl = new URL(url);
    const source = req.headers.get("x-forwarded-for") || "unknown";
    // Clone the request in order to read the body without disturbing the original
    const reqClone = req.clone();
    let messageBody = "";
    try {
      messageBody = await reqClone.text();
    } catch {
      messageBody = "<unable to read body>";
    }

    console.log("\n\n--->\nIncoming Request:");
    if (source !== "unknown") {
      console.log("  Source:", source);
    }
    if (parsedUrl.search) {
      console.log("  Query:", parsedUrl.search);
    }
    console.log("  URL:", parsedUrl.href);
    console.log("  Destination:", parsedUrl.pathname);
    console.log("  Method:", method);
    console.log("  Headers:", Object.fromEntries(req.headers));
    if (messageBody) {
      console.log("  Body:", messageBody);
    }

    // Call the actual handler
    const response = await handler(req);

    // Optionally, you can log response details
    console.log("Outgoing Response:", response.status);
    return response;
  };
}

Deno.serve(
  { port: Number(Deno.env.get("MESSAGE_QUEUE_SERVICE_PORT")) || 8004 },
  loggerMiddleware(handler)
);

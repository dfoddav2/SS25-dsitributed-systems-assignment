import { RedisClient } from "jsr:@iuioiua/redis";
import { z } from "npm:zod";

import {
  TransactionSchema,
  MessageQueueNamingSchema,
  ResultSchema,
} from "./types/schemas.ts";
import { AUTHENTICATION_SERVICE_URL } from "./utils/config.ts";

// Set up Redis client
// https://docs.deno.com/examples/redis/
console.log("Message Queue Service - v1.0.0");
console.log("Connecting to Redis...");

const SKIP_AUTHENTICATION =
  Boolean(Deno.env.get("SKIP_MESSAGE_QUEUE_AUTHENTICATION")) || false;
const QUEUES_SET_NAME = "message_queues"; // Set name to store all queues in Redis
const MAX_QUEUE_SIZE = Number(Deno.env.get("MAX_QUEUE_SIZE")) || 10;
const redisPort = Number(Deno.env.get("REDIS_PORT")) || 6379;
const redisHost = Deno.env.get("REDIS_HOST") || "127.0.0.1";
console.log("Trying to connect to Redis at", redisHost, ":", redisPort);
// General Redic client connection
const redisConn = await Deno.connect({ hostname: redisHost, port: redisPort });
const redisClient = new RedisClient(redisConn);
await redisClient.sendCommand([
  "AUTH",
  Deno.env.get("REDIS_USERNAME") || "default",
  Deno.env.get("REDIS_PASSWORD") || "message_queue_password",
]);
// Blocking Redis client connection for long polling of `ml_mpi_service`
const blockingRedisConn = await Deno.connect({
  hostname: redisHost,
  port: redisPort,
});
const blockingRedisClient = new RedisClient(blockingRedisConn);
await blockingRedisClient.sendCommand([
  "AUTH",
  Deno.env.get("REDIS_USERNAME") || "default",
  Deno.env.get("REDIS_PASSWORD") || "message_queue_password",
]);

await redisClient.sendCommand(["FLUSHDB"]); // Clear the database
await redisClient.sendCommand(["SADD", QUEUES_SET_NAME, "transactions_queue"]);
await redisClient.sendCommand(["SADD", QUEUES_SET_NAME, "results_queue"]);

console.log("Connected to Redis successfully! Database flushed.");

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
      if ("is_fraudulent" in body.message) {
        // If the message is a result, validate against ResultSchema
        ResultSchema.parse(body.message);
      } else {
        // For now we just assume it's a transaction
        TransactionSchema.parse(body.message); // Validate the message against the schema
      }
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
    // Check that message queue is not full
    const queueSize = (await redisClient.sendCommand([
      "LLEN",
      body.queue_name,
    ])) as number;
    if (queueSize >= MAX_QUEUE_SIZE && body.queue_name !== "results_queue") {
      return new Response(
        JSON.stringify({
          error: "Queue is full",
          message: `Queue ${body.queue_name} is full`,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
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

  // `/push-n` message queue endpoint
  // - adds a new message to the queue and appends it to its end.
  // - The message should include all the data fields defined in Assignment 2 for the transactions or the results table in the transaction service
  // - same as `/push`, but allows to push multiple messages at once in an array
  if (pathname === "/push-n" && req.method === "POST") {
    const body = await req.json();
    // Basic body structure validation
    if (
      !body.queue_name ||
      !Array.isArray(body.messages) ||
      body.messages.length === 0
    ) {
      return new Response(
        JSON.stringify({
          error: "Invalid request body",
          message:
            "Request must include 'queue_name' (string) and 'messages' (non-empty array).",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

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
    // Validate each message in the array
    for (let i = 0; i < body.messages.length; i++) {
      const message = body.messages[i];
      try {
        if (typeof message !== "object" || message === null) {
          throw new Error("Message must be an object.");
        }
        if ("is_fraudulent" in message) {
          ResultSchema.parse(message);
        } else {
          TransactionSchema.parse(message);
        }
      } catch (e) {
        const errorMessage =
          e instanceof z.ZodError
            ? e.errors
            : e instanceof Error
            ? e.message
            : "Unknown validation error";
        return new Response(
          JSON.stringify({
            error: `Invalid message format for message at index ${i}`,
            message: errorMessage,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Check that message queue has capacity for all new messages
    const currentQueueSize = (await redisClient.sendCommand([
      "LLEN",
      body.queue_name,
    ])) as number;

    if (currentQueueSize + body.messages.length > MAX_QUEUE_SIZE) {
      return new Response(
        JSON.stringify({
          error: "Queue capacity exceeded",
          message: `Queue ${body.queue_name} does not have enough space for ${body.messages.length} new messages. Current size: ${currentQueueSize}, Max size: ${MAX_QUEUE_SIZE}.`,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    // Now we can push all messages to the queue
    // LPUSH prepends elements, so the last element in the command becomes the new head.
    // This preserves the order of the input `messages` array for FIFO with RPOP.
    const stringifiedMessages = body.messages.map(
      (msg: z.infer<typeof TransactionSchema>) => JSON.stringify(msg)
    );

    console.log(
      `Pushing ${stringifiedMessages.length} messages to queue: ${body.queue_name}`
    );

    const lpushCommandArgs = ["LPUSH", body.queue_name, ...stringifiedMessages];
    const result = await redisClient.sendCommand(lpushCommandArgs);

    if (typeof result === "number" && result > 0) {
      // LPUSH returns the new length of the list
      return new Response(
        JSON.stringify({
          message: `${body.messages.length} message(s) have been added to queue ${body.queue_name}. New queue size: ${result}.`,
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }
      );
    } else {
      console.error("Failed to add messages to queue", result);
      return new Response(
        JSON.stringify({ message: "Failed to add messages to queue" }),
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

  // `/pull-n` message queue endpoint
  // - long polling endpoint that waits for at least one message to be available in the queue
  // - if no message is available, it will wait for up to 30 seconds
  // - if a message is available, it will return up to `count` messages from the queue
  // - if no messages are avialble, returns 204
  // - if the queue does not exist, returns 404
  if (pathname === "/pull-n" && req.method === "GET") {
    const url = new URL(req.url);
    const queueName = url.searchParams.get("queue-name");
    const count = url.searchParams.get("count");

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
    // Validate the count parameter
    if (!count || isNaN(Number(count)) || Number(count) <= 0) {
      return new Response(
        JSON.stringify({
          error: "Invalid count parameter",
          message: "Count must be a positive integer",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate the queue name format
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

    // Use BLPOP to wait for messages in the queue
    const timeout = 30; // Timeout in seconds
    try {
      // 1. Use BRPOP to wait for at least one message
      console.log(
        `[pull-n] Attempting BRPOP on queue "${queueName}" with dedicated client.`
      );
      const brpopResult = await blockingRedisClient.sendCommand([
        "BRPOP",
        queueName,
        timeout.toString(),
      ]);

      if (!brpopResult) {
        // BRPOP timed out - no messages available
        console.log(
          `[pull-n] BRPOP timed out for queue "${queueName}". No messages available within ${timeout}s.`
        );
        return new Response(null, { status: 204 }); // 204 No Content
      }
      // Check if brpopResult is an array before accessing its length
      if (Array.isArray(brpopResult) && brpopResult.length > 0) {
        const initialMessage = brpopResult[1] as string; // First message from BRPOP
        const messages: string[] = [initialMessage]; // Start with the first message

        // 2. Now, try to get the remaining messages (up to count - 1) using non-blocking RPOP
        const remainingCount = Number(count) - 1;
        for (let i = 0; i < remainingCount; i++) {
          const rpopResult = await redisClient.sendCommand(["RPOP", queueName]);
          if (rpopResult) {
            messages.push(rpopResult as string);
          } else {
            // Queue is empty - no more messages
            break;
          }
        }
        console.log(
          `[pull-n] Pulled ${messages.length} messages from queue "${queueName}".`
        );

        // 3. Return all messages as a JSON array
        return new Response(JSON.stringify(messages), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } else {
        console.log(
          `[pull-n] BRPOP returned an unexpected result for queue "${queueName}".`
        );
        return new Response(null, { status: 500 }); // 500 Internal Server Error
      }
    } catch (error) {
      console.error(
        `[pull-n] Error during BRPOP/RPOP for queue "${queueName}":`,
        error
      );
      return new Response(
        JSON.stringify({
          error: "Failed to pull messages from queue due to a server error",
          message:
            error instanceof Error
              ? error.message
              : "Unknown Redis communication error",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
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
                Deno.env.get("MESSAGE_QUEUE_SERVICE_PORT") || 8003
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

const protectedPaths = ["/push", "/pull", "/list", "/create", "/delete"];
const accessPolicy: Record<string, string[]> = {
  "/push": ["agent", "administrator"],
  "/pull": ["agent", "administrator"],
  "/list": ["agent", "administrator"],
  "/create": ["administrator"],
  "/delete": ["administrator"],
};

function authMiddleware(
  handler: (req: Request) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    // If the endpoint is not protected, skip authentication
    const { pathname } = new URL(req.url);
    if (!protectedPaths.includes(pathname)) {
      return handler(req);
    }
    // Destructure the request to get Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // If no token is found, return 401 Unauthorized
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "No token found in Authorization header",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    // Forward the auth header to the authentication service
    const response = await fetch(`${AUTHENTICATION_SERVICE_URL}/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
    });
    // If the response is not ok, return 401 Unauthorized
    if (!response.ok) {
      console.log("User verification failed:", response.status);
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "User verification failed",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    // Check user role validity for endpoint access
    const data = await response.json();
    if (!accessPolicy[pathname].includes(data.role)) {
      return new Response(
        JSON.stringify({
          error: "Forbidden",
          message: "You are not authorized to access this endpoint",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    // If all is okay, proceed to the handler
    console.log("User verified:", data);
    return handler(req);
  };
}

console.log(
  `Routes initialized, visit http://localhost:${
    Deno.env.get("MESSAGE_QUEUE_SERVICE_PORT") || 8003
  }/ui to see the Scalar UI.`
);

Deno.serve(
  { port: Number(Deno.env.get("MESSAGE_QUEUE_SERVICE_PORT")) || 8003 },
  (req) => {
    if (SKIP_AUTHENTICATION) {
      console.log("Skipping authentication for message queue service");
      return loggerMiddleware(handler)(req);
    } else {
      console.log("Authentication enabled for message queue service");
      return authMiddleware(loggerMiddleware(handler))(req);
    }
  }
);

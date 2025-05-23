import { RedisClient } from "jsr:@iuioiua/redis";
import { z } from "npm:zod";

import {
  TransactionSchema,
  MessageQueueNamingSchema,
} from "./types/schemas.ts";
import { AUTHENTICATION_SERVICE_URL } from "./utils/config.ts";

// Set up Redis client
// https://docs.deno.com/examples/redis/
console.log("Message Queue Service - v1.0.0");
console.log("Connecting to Redis...");
const redisPort = Number(Deno.env.get("REDIS_PORT")) || 6379;
const redisHost = Deno.env.get("REDIS_HOST") || "127.0.0.1";
console.log("Trying to connect to Redis at", redisHost, ":", redisPort);
const redisConn = await Deno.connect({ hostname: redisHost, port: redisPort });
const redisClient = new RedisClient(redisConn);
await redisClient.sendCommand([
  "AUTH",
  Deno.env.get("REDIS_USERNAME") || "default",
  Deno.env.get("REDIS_PASSWORD") || "message_queue_password",
]);
await redisClient.sendCommand(["FLUSHDB"]); // Clear the database

const QUEUES_SET_NAME = "message_queues"; // Set name to store all queues in Redis
const MAX_QUEUE_SIZE = Number(Deno.env.get("MAX_QUEUE_SIZE")) || 10;
console.info("Max queue size:", MAX_QUEUE_SIZE);

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
    // Check that message queue is not full
    const queueSize = (await redisClient.sendCommand([
      "LLEN",
      body.queue_name,
    ])) as number;
    if (queueSize >= MAX_QUEUE_SIZE) {
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

Deno.serve(
  { port: Number(Deno.env.get("MESSAGE_QUEUE_SERVICE_PORT")) || 8003 },
  loggerMiddleware(authMiddleware(handler))
);

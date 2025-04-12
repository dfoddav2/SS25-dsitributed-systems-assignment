import { DatabaseSync } from "node:sqlite";
import { logger } from "hono/logger";
import { OpenAPIHono } from "npm:@hono/zod-openapi";
import { swaggerUI } from "npm:@hono/swagger-ui";
import transactions from "./routes/transactions.ts";
import seedDatabase from "./utils/seed.ts";

// Initialize the database
export const db = new DatabaseSync("transactions.db");
seedDatabase(db);

// Create your custom PrintFunc function.
const customPrint = (message: string, ...rest: string[]) => {
  // Log additional details if needed.
  console.log(message, ...rest);
};

// Initialize the OpenAPIHono app
const app = new OpenAPIHono();
// Documentation, Swagger and logger
// @ts-ignore
app.use(logger(customPrint));
app.use("/*", async (c, next) => {
  // Get the underlying native Request from HonoRequest
  const headersRecord = c.req.header();
  const paramsRecord = c.req.param();
  console.log("Params: ", paramsRecord);

  console.log(`\nHeaders:`);
  Object.entries(headersRecord).forEach(([key, value]) => {
    console.log(`${key}: ${value}`);
  });
  console.log(`\nParams:`);
  Object.entries(paramsRecord).forEach(([key, value]) => {
    console.log(`${key}: ${value}`);
  });
  // Inspect Content-Type to determine how to log the body.
  const contentType = c.req.header("content-type") || "";
  let bodyLog = "<no body>";

  try {
    if (contentType.includes("application/json")) {
      const parsed = await c.req.json();
      bodyLog = JSON.stringify(parsed, null, 2);
    } else if (contentType.includes("text/")) {
      bodyLog = await c.req.text();
    } else if (
      contentType.includes("multipart/form-data") ||
      contentType.includes("application/x-www-form-urlencoded")
    ) {
      // parseBody returns a Record<string, string | File> (or array if multiple)
      const parsed = await c.req.parseBody();
      bodyLog = JSON.stringify(parsed, null, 2);
    } else {
      // Fallback: try text
      bodyLog = await c.req.text();
    }
  } catch (error) {
    if (error instanceof Error) {
      bodyLog = `<error reading body: ${error.message}>`;
    } else {
      bodyLog = "<error reading body>";
    }
  }
  console.log(`\nBody: ${bodyLog}\n`);

  await next();
});
app.get(
  "/ui",
  swaggerUI({
    url: "/doc",
  })
);
app.doc("/doc", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "Transactions API",
  },
});

// Routes
app.route("/transactions", transactions);
app.route("/", app);

Deno.serve(app.fetch);

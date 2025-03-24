import { DatabaseSync } from "node:sqlite";
import { logger } from "hono/logger";
import { OpenAPIHono } from "npm:@hono/zod-openapi";
import { swaggerUI } from "npm:@hono/swagger-ui";
import transactions from "./routes/transactions.ts";

// Initialize the database
export const db = new DatabaseSync("transactions.db");
// Create the transactions table if it doesn't exist
// NOTE: Table names should be singular, but transaction is a reserved keyword in SQLite
db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    vendor_id INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    status TEXT NOT NULL,
    amount REAL NOT NULL
  );
`);
// Create the results table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS result (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    is_fraudulent INTEGER NOT NULL,
    confidence REAL NOT NULL,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
  );
`);

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

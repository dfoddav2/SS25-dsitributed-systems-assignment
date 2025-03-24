import { DatabaseSync } from "node:sqlite";
import { logger } from "hono/logger";
import { Hono } from "hono";
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

// Initialize the Hono app
const app = new Hono();
// Setup logger and Swagger UI
app.use(logger());
app.get("/ui", swaggerUI({ url: "/doc" }));

// Initialize the wrapper OpenAPIHono app
const openApiApp = new OpenAPIHono();
// Set up documentation endpoint for Swagger
openApiApp.doc("/doc", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "Transactions API",
  },
});
openApiApp.route("/transactions", transactions);

app.route("/", openApiApp as unknown as Hono);
Deno.serve(app.fetch);

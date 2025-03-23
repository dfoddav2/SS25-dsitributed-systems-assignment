import { DatabaseSync } from "node:sqlite";
// import { Hono, Context } from "hono";
import { z } from "npm:@hono/zod-openapi";
import { OpenAPIHono, createRoute } from "npm:@hono/zod-openapi";
import { swaggerUI } from "npm:@hono/swagger-ui";
import transactions from "./routes/transactions.ts";

// Initialize the database
export const db = new DatabaseSync("transactions.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    description TEXT
  );
`);

const helloRoute = createRoute({
  method: "get",
  path: "/",
  // request: {
  //   params: ParamsSchema,
  // },
  responses: {
    200: {
      content: {
        "text/plain": {
          schema: z.string().openapi({ example: "Hello, OpenAPI!" }),
        },
      },
      description: "Get a welcome message from the server",
    },
  },
});

// Initialize the Hono app
const app = new OpenAPIHono();
// Set up documentation and Swagger
app.get("/ui", swaggerUI({ url: "/doc" }));
app.doc("/doc", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "Transactions API",
  },
});

// Define the routes
app.openapi(helloRoute, (c) => {
  return c.text("Hello, OpenAPI!");
});
// app.get("/list", (c) => {
//   const rows = db
//     .prepare("SELECT id, amount, description FROM transactions")
//     .all();
//   return c.json(rows);
// });
app.route("/transactions", transactions);

Deno.serve(app.fetch);

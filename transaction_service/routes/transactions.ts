import { OpenAPIHono } from "npm:@hono/zod-openapi";

const transactions = new OpenAPIHono();

transactions.get("/", (c) => {
  return c.text("List all transactions");
});

transactions.post("/", (c) => {
  return c.text("Create a new transaction");
});

transactions.get("/:id", (c) => {
  const id = c.req.param("id");
  return c.text(`Transaction ID: ${id}`);
});

export default transactions;

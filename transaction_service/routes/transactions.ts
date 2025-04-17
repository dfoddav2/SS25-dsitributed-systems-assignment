import { OpenAPIHono, createRoute, z } from "npm:@hono/zod-openapi";
// import { Context } from "hono";

import { db } from "../main.ts";

const transactions = new OpenAPIHono();

enum TransactionStatus {
  SUBMITTED = "submitted",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
}

interface Transaction {
  id: number;
  customer_id: number;
  vendor_id: number;
  timestamp: string;
  status: TransactionStatus;
  amount: number;
}

const transactionResponseSchema = z.object({
  id: z.number(),
  customer_id: z.number(),
  vendor_id: z.number(),
  timestamp: z.string().datetime().openapi({ example: "2021-01-01T00:00:00Z" }),
  status: z.nativeEnum(TransactionStatus),
  amount: z.number().openapi({ example: 100.0 }),
});

const transactionCreateSchema = z.object({
  customer_id: z.number(),
  vendor_id: z.number(),
  timestamp: z.string().datetime().openapi({ example: "2021-01-01T00:00:00Z" }),
  status: z.nativeEnum(TransactionStatus),
  amount: z.number().openapi({ example: 100.0 }),
});

const transactionUpdateSchema = transactionCreateSchema.partial();

const ErrorSchema = z.object({
  message: z.string().openapi({ example: "Bad Request" }),
});

const allTransactionsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["transactions"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(transactionResponseSchema),
        },
      },
      description: "List all transactions",
    },
  },
});
transactions.openapi(allTransactionsRoute, (c) => {
  const rows = db.prepare("SELECT * FROM transactions").all();
  // TODO: Validate the response data with zod
  return c.json(rows, 200);
});

const createTransactionRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["transactions"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: transactionCreateSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: transactionResponseSchema,
        },
      },
      description: "Create a new transaction",
    },
    404: {
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
      description: "Vendor or customer not found",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
      description: "Validation Error",
    },
    500: {
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
      description: "Transaction creation failed",
    },
  },
});
transactions.openapi(createTransactionRoute, async (c) => {
  const body = await c.req.json(); // Get the JSON body
  try {
    console.log("Received body:", body); // Log the received body
    const validatedData = transactionCreateSchema.parse(body); // Validate the data

    const { customer_id, vendor_id, timestamp, status, amount } = validatedData;

    // TODO: Here we could additionally check that user and vendor exist
    const stmt = db.prepare(
      "INSERT INTO transactions (customer_id, vendor_id, timestamp, status, amount) VALUES (?, ?, ?, ?, ?)"
    );
    const info = stmt.run(customer_id, vendor_id, timestamp, status, amount);

    if (info.changes > 0) {
      try {
        const row = db
          .prepare("SELECT * FROM transactions WHERE id = ?")
          .get(info.lastInsertRowid) as Transaction;
        const validatedRow = transactionResponseSchema.parse(row);
        console.log("Transaction created:", validatedRow);
        return c.json(validatedRow, 201);
      } catch (error) {
        console.error("Validation error:", error);
        return c.json({ message: "Transaction data invalid" }, 400);
      }
    } else {
      // Handle the case where the insertion failed
      return c.json({ message: "Transaction creation failed" }, 500);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Validation error:", error.errors); // Log the Zod errors
      return c.json({ message: "Transaction data invalid" }, 400); // Return the errors in the response
    } else if (error instanceof Error) {
      console.error("Unexpected error:", error.message);
      return c.json({ message: "Unexpected error" }, 500);
    } else {
      return c.json({ message: "Unexpected error" }, 500);
    }
  }
});

const transactionRoute = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["transactions"],
  request: {
    params: z.object({
      id: z.preprocess((val) => Number(val), z.number()),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: transactionResponseSchema,
        },
      },
      description: "Get a transaction by ID",
    },
    404: {
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
      description: "Transaction not found",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
      description: "Validation Error",
    },
  },
});
transactions.openapi(
  transactionRoute,
  (c) => {
    const { id } = c.req.valid("param");
    const row = db
      .prepare("SELECT * FROM transactions WHERE id = ?")
      .get(id) as Transaction;
    if (!row) {
      return c.json({ message: "Transaction not found" }, 404);
    }
    return c.json(row, 200);
  },
  (result, c) => {
    if (!result.success) {
      return c.json({ message: "Validation Error" }, 400);
    }
  }
);

const patchTransactionRoute = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["transactions"],
  request: {
    params: z.object({
      id: z.preprocess((val) => Number(val), z.number()),
    }),
    body: {
      content: {
        "application/json": {
          schema: transactionUpdateSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: transactionResponseSchema,
        },
      },
      description: "Partially updated transaction",
    },
    404: {
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
      description: "Transaction not found",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
      description: "Validation Error",
    },
    500: {
      content: {
        "application/json": {
          schema: ErrorSchema,
        },
      },
      description: "Transaction update failed",
    },
  },
});

transactions.openapi(
  patchTransactionRoute,
  (c) => {
    const { id } = c.req.valid("param");
    // Capture the partial update values.
    const updates = c.req.valid("json");

    // Retrieve existing transaction from DB
    const current = db
      .prepare("SELECT * FROM transactions WHERE id = ?")
      .get(id) as Transaction;
    if (!current) {
      return c.json({ message: "Transaction not found" }, 404);
    }

    // Merge partial updates with the current record.
    const updated = { ...current, ...updates };

    // Prepare the update query.
    const stmt = db.prepare(`
        UPDATE transactions
        SET customer_id = ?,
            vendor_id = ?,
            timestamp = ?,
            status = ?,
            amount = ?
        WHERE id = ?
      `);
    const info = stmt.run(
      updated.customer_id,
      updated.vendor_id,
      updated.timestamp,
      updated.status,
      updated.amount,
      id
    );

    if (info.changes === 0) {
      return c.json({ message: "Transaction update failed" }, 500);
    }

    try {
      // Retrieve and validate the updated transaction.
      const row = db
        .prepare("SELECT * FROM transactions WHERE id = ?")
        .get(id) as Transaction;
      const validatedRow = transactionResponseSchema.parse(row);
      return c.json(validatedRow, 200);
    } catch (error) {
      console.error("Validation or update error:", error);
      return c.json({ message: "Transaction update failed" }, 500);
    }
  },
  (result, c) => {
    if (!result.success) {
      return c.json({ message: "Validation Error" }, 400);
    }
  }
);

export default transactions;

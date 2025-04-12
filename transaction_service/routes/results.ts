import { OpenAPIHono, createRoute, z } from "npm:@hono/zod-openapi";
// import { Context } from "hono";

import { db } from "../main.ts";

const results = new OpenAPIHono();

enum ResultStatus {
  FRAUDULENT = "fraudulent",
  NOT_FRAUDULENT = "not_fraudulent",
}

interface Result {
  id: number;
  transaction_id: number;
  timestamp: string;
  is_fraudulent: boolean;
  confidence: number;
}

const resultResponseSchema = z.object({
  id: z.number(),
  transaction_id: z.number(),
  timestamp: z.string().datetime().openapi({ example: "2021-01-01T00:00:00Z" }),
  is_fraudulent: z.boolean().openapi({ example: true }),
  confidence: z.number().openapi({ example: 0.95 }),
});

const resultCreateSchema = z.object({
  transaction_id: z.number(),
  timestamp: z.string().datetime().openapi({ example: "2021-01-01T00:00:00Z" }),
  is_fraudulent: z.boolean().openapi({ example: true }),
  confidence: z.number().openapi({ example: 0.95 }),
});

const resultUpdateSchema = resultCreateSchema.partial();

const ErrorSchema = z.object({
  message: z.string().openapi({ example: "Bad Request" }),
});

const allResultsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["results"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(resultResponseSchema),
        },
      },
      description: "List all results",
    },
  },
});
results.openapi(allResultsRoute, (c) => {
  const rows = db.prepare("SELECT * FROM transactions").all();
  // TODO: Validate the response data with zod
  return c.json(rows, 200);
});

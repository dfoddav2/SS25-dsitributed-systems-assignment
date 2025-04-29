import { z } from "npm:zod";

// Define Transaction Schema
// {id: 1, customer_id: 1, vendor_id: 1, timestamp: "2023-01-01T12:00:00Z", status: "accepted", amount: 100}
export const TransactionSchema = z.object({
  id: z.number().min(1),
  customer_id: z.number().min(1),
  vendor_id: z.number().min(1),
  timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }),
  status: z.enum(["accepted", "rejected", "pending"]),
  amount: z.number().min(0),
});

// Define Transaction schema
// [{"id":1,"transaction_id":1,"timestamp":"2023-01-01T12:00:00Z","is_fraudulent":0,"confidence":0.95}]
export const ResultSchema = z.object({
  id: z.number().min(1),
  transaction_id: z.number().min(1),
  timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }),
  is_fraudulent: z.union([z.literal(0), z.literal(1)]),
  confidence: z.number().min(0).max(1),
});

export const MessageQueueNamingSchema = z.object({
  name: z.string().min(4).max(20),
});

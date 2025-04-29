import { DatabaseSync } from "node:sqlite";
import seedDatabase from "./utils/seed.ts";
import { createJWT, verifyJWT } from "./utils/jwt.ts";
import { User } from "./types.ts";

// Initialize and seed the database
export const db = new DatabaseSync("users.db");
seedDatabase(db);

// Create handler function
const handler = async (req: Request): Promise<Response> => {
  const { pathname } = new URL(req.url);

  // Login endpoint
  if (pathname === "/login" && req.method === "POST") {
    try {
      const body = await req.json();
      const { username, password } = body;

      const user = db
        .prepare("SELECT * FROM user WHERE username = ? AND password = ?")
        .get(username, password) as User;

      if (!user) {
        return new Response(
          JSON.stringify({ message: "Invalid credentials" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      const token = await createJWT({ id: user.id, role: user.role });
      return new Response(
        JSON.stringify({
          user: { id: user.id, username: user.username, role: user.role },
          token: token,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      if (error instanceof Error) {
        return new Response(
          JSON.stringify({ message: "Bad Request", error: error.message }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      } else {
        return new Response(
          JSON.stringify({ message: "Something went wrong" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }
  }

  // Verify endpoint
  if (pathname === "/verify" && req.method === "POST") {
    try {
      // console.log("\nVerifying JWT...");
      const token = req.headers.get("Authorization")?.split(" ")[1];
      if (!token) {
        return new Response(
          JSON.stringify({
            message: "Unauthorized",
            error: "Token missing from header",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
      // console.log("-> Token:", token);
      // Verify the JWT token and return the payload if successfull
      const payload = await verifyJWT(token);
      // console.log("-> Payload:", payload);

      if (!payload) {
        return new Response(
          JSON.stringify({
            message: "Unauthorized",
            error: "Token is invalid",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ ...payload }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      // console.error("\n\nJWT verification failed:", error);
      if (error instanceof Error) {
        if (error.name === "JWTExpired") {
          return new Response(
            JSON.stringify({
              message: "Unauthorized",
              error: "JWT has expired",
            }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        } else if (error.name === "JWTInvalid") {
          return new Response(
            JSON.stringify({
              message: "Unauthorized",
              error: "JWT is invalid",
            }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        } else {
          return new Response(
            JSON.stringify({ message: "Unauthorized", error: error.message }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        }
      }
      return new Response(
        JSON.stringify({
          message: "Something went wrong",
          error: error instanceof Error ? error.message : String(error),
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
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

// Create the Deno server using the built-in serve API
Deno.serve(
  { port: Number(Deno.env.get("AUTHENTICATION_SERVICE_PORT")) || 8001 },
  loggerMiddleware(handler)
);

import { JWTPayload, jwtVerify, SignJWT } from "npm:jose";
import { DatabaseSync } from "node:sqlite";

enum UserRole {
  ADMIN = "administrator",
  AGENT = "agent",
  SECRETARY = "secretary",
}

type User = {
  id: number;
  username: string;
  password: string;
  role: UserRole;
};

// Initialize the database
export const db = new DatabaseSync("users.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL
  );
`);

const users = [
  { id: 1, username: "admin", password: "secret", role: UserRole.ADMIN },
  { id: 2, username: "agent", password: "secret", role: UserRole.AGENT },
  {
    id: 3,
    username: "secretary",
    password: "secret",
    role: UserRole.SECRETARY,
  },
];
// Insert some initial users
for (const user of users) {
  db.exec(`
    INSERT INTO user (username, password, role)
    VALUES ('${user.username}', '${user.password}', '${user.role}');
  `);
}

// Initialize JWT secret key from environment variable
const secretKey = new TextEncoder().encode(Deno.env.get("JWT_SECRET"));
if (!secretKey) {
  throw new Error("JWT_SECRET environment variable is required");
  // Deno.exit(1);
}
const jwtExpiry = Deno.env.get("JWT_EXPIRY") || "1h";
if (!jwtExpiry) {
  throw new Error("JWT_EXPIRY environment variable is required");
  // Deno.exit(1);
}

// JWT Creation logic
async function createJWT(payload: JWTPayload): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(jwtExpiry)
    .sign(secretKey);
}

// JWT Verification logic
async function verifyJWT(token: string): Promise<JWTPayload | null> {
  const { payload } = await jwtVerify(token, secretKey);
  console.log("JWT is valid:", payload);
  return payload;
}

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
      return new Response(JSON.stringify({ token }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
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
      const { token } = await req.json();
      const payload = await verifyJWT(token);

      return new Response(JSON.stringify({ ...payload }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
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
        }
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

  // Default response
  return new Response("Authentication Service is running", { status: 200 });
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
    console.log("  Source:", source);
    console.log("  Destination:", parsedUrl.pathname);
    console.log("  Method:", method);
    console.log("  Headers:", Object.fromEntries(req.headers));
    console.log("  Message Body:", messageBody);

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

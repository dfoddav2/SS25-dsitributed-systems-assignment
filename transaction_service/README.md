# Authentication Service

Acts as the main business logic and orchestrator of the whole application. Handles any CRUD operations related to transactions and predicted results of whether the given transaction is fraudulent or not. Exposes API for the frontend of end users to monitor and act upon predictions provided by the fraud detection service.

## How to run

To only run this service you can start it via the included `Dockerfile` or manually, given you have the `Deno` runtime installed, by running:

```bash
deno run dev
```

## Frontend UI

As I did not want to spend too much time on implementing a custom frontend, I just chose to use a framework with easy `OpenAPI` and `SwaggerUI` integration. All of the endpoints are properly documented and can be accessed, tried out through [http://localhost:8000/ui]("http://localhost:8000/ui").

## Structure

For this component, the [main.ts](./main.ts) serves as the main entry point of the `Hono` server, here I set up the database connection, call the seeding of it, initialize the server, set up loggers and the `SwaggerUI` on the [/ui]("http://localhost:8000/ui") endpoit.

After this I have outsourced the endpoints to different files in the `/routes` directory based on what element they are related to.

### Transactions

Defines CRUD operations related to transactions.

- GET /: Retrieves a list of all transactions.
- POST /: Creates a new transaction.
- GET /{id}: Retrieves a specific transaction by its ID.
- PATCH /{id}: Partially updates an existing transaction by its ID.

### Results

Defines CRUD operations related to prediction results on whether the given transaction is fraudulent or not.

It defines similar routes to the ones of transactions, but they are not used, nor have been tested yet as this is not a requirement of the assignments yet, but is a likely upcoming feature.

### Seed

It can be found in [seed.ts](./utils/seed.ts) and is called in [main.ts](./main.ts), right after initializing the database, creating the transactions and result table if it doesn't exist yet and prefilling with some arbirtrary records.

For authenticating you may use any of the predefined user's from the `authentication_service` as shown in the main repository [README](../README.md).

Or create your own.

## Technologies used

As it is not a serious production application I thought I would keep it as simple as possible, while still studying something new. In the end I decided to try out `Deno`, which is a new, alternative runtime to `Node.JS` (similarly to `Bun`) spearheaded by Node's original creator and mixed it with the recommended server framework `Hono`.

Similarly to the `authentication_service` I am utilizing an `sqlite` database for storing the transactions and prediciton results, managed through the `node-sqlite` package.

Since this service does quite a lot more than the `authentication_service`, I am using the `Hono` framework here, not just the built-in server capabilities.

## Docs

- [Deno](https://docs.deno.com/)
- [node-sqlite](https://nodejs.org/api/sqlite.html)
- [Hono](https://hono.dev/docs/)

# Authentication Service

Acts as the authentication system for the whole application. At the moment we are using a `stateless authentication` approach, creating a `JWT` token with user details and a specific expiry time, then passing that token via headers in subsequent requests.

The authentication service acts as a gateway that is called by middlewares of other services, making sure that the user has the right level of access for the given query.

## How to run

To only run this service you can start it via the included `Dockerfile` or manually, given you have the  `Deno` runtime installed, by running:

```bash
deno run dev
```

## Structure

For this component, all of the business logic and setup is defined in [main.ts](./main.ts). Here you can find the logic from handling logins and registrations to verifying tokens.

### JWT

I have outsourced the logic of actually creating and verifying tokens through the `Jose` package to a separate [jwt.ts](./utils/jwt.ts) file in the `utils` directory.

### Seed

Similarly to the `JWT` logic, it can be found in [seed.ts](./utils/seed.ts) and is called in [main.ts](./main.ts), right after initializing the database, creating the users table if it doesn't exist yet and prefilling with users of different roles.

## Technologies used

As it is not a serious production application I thought I would keep it as simple as possible, while still studying something new. In the end I decided to try out `Deno`, which is a new, alternative runtime to `Node.JS` (similarly to `Bun`) spearheaded by Node's original creator.

As there are not as many features and endpoints implemented by this service, I have decided to keep it clean and did not use any framework, simply `Deno`'s built-in server with an `sqlite` database for storing users, managed through the `node-sqlite` package.

## Docs

- [Deno](https://docs.deno.com/)
- [node-sqlite](https://nodejs.org/api/sqlite.html)

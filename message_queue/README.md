# Message Queue

This is a simple, self-made implementation of a message broker for our application specifically. It exposes CRUD operations for creating and interacting with message queues, and of course endpoints for pushing to and pulling from them. At the moment it simply stores and provides messages, with the added capability of persistently storing queues, making it able to continue from where it left off, in case of an outage for example.

## How to run

To only run this service you can start it via the included `docker-compose.yaml` file in its entirity:

```bash
docker compose up --build
```

But you can also manually run the message queue, by starting the Redis through Docker, and then starting the queue via Deno. (Note that for this you will need the Deno runtime installed)

```bash
docker compose up redis
deno run dev
```

## Frontend UI

As I did not want to spend too much time on implementing a custom frontend, I am simply using `Scalar`, which is a quick endpoint tester consuming OpenAPI documentation, quite alike `Swagger`. Once running, you can find it at [http://localhost:8003/ui]("http://localhost:8003/ui").

In this case since I am using the built-in server of Deno, it was quite a challenge to get the UI up and running, I had to separately document all of my endpoints in the [openapi.yaml](./openapi.yaml) documentation file, serve it on the `/docs` endpoint, then consume it with a served html of scalar on `/ui`.

> [!NOTE]
> If you change the port of the application via the env variables, you will still have to manually change the server's port number in the [openapi.yaml](./openapi.yaml) file.

## Structure

For this component, all of the business logic and setup is defined in [main.ts](./main.ts). Here you can find the logic from handling logins and registrations to verifying tokens.

TODO: Finish this

## Technologies used

### Server

As it is not a serious production application I thought I would keep it as simple as possible, while still studying something new. In the end I decided to try out `Deno`, which is a new, alternative runtime to `Node.JS` (similarly to `Bun`) spearheaded by Node's original creator.

As there are not as many features and endpoints implemented by this service, I have decided to keep it clean and did not use any framework, simply `Deno`'s built-in server.

### Database

## Docs

- [Deno](https://docs.deno.com/)
- [Redis](https://redis.io/docs/latest/)
- [Deno + Redis](https://docs.deno.com/examples/redis_tutorial/)
- [Redis - Queue](https://redis.io/glossary/redis-queue/)
- [Redis - Message Broker](https://redis.io/solutions/messaging/)

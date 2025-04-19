# Authentication Service

The backend service is responsible for handling all interactions with the user through the frontend API. It exposes endpoints for the user to interact with the application and forwards those requests to their respective services to be handled, either the `Authentication Service` or the `Transaction Service`. Also exposes a Scalar UI interface for easy interaction and testing.

## How to run

To only run this service you can start it via the included `Dockerfile` or manually, given you have the `.NET` runtime or SDK installed, by running:

```bash
dotnet watch run
```

### The question of ENV variables

I am not really a seasoned veteran in `.NET`, but seemingly setting env variables here is not as easy as in case of `Node` for example. Supposedly, the variable is read from the shell starting the process, thus you would have to manually `export` the variables before running or create a script for it.

Instead when running locally there is a [launchSettings.json](./Properties/launchSettings.json) file defined inside `Properties`, filling the variables defined within automatically. If you want to change the default ports, do so here.

The Docker instance instead uses the production deployment of `.NET`, skipping the launch settings and opting to use the variables defined in the container by [.env.docker](.env.docker)

## Frontend UI

As I did not want to spend too much time on implementing a custom frontend, I am simply using `Scalar`, which is a quick endpoint tester consuming OpenAPI documentation, quite alike `Swagger`. Once running, you can find it at [http://localhost:8003/ui]("http://localhost:8003/ui").

## Structure

`.NET` applications such as this one use a traditional `MVC` architecture, with [Program.cs](./Program.cs) as the main entry point of the application. All models are defined in the [Models](./Models/) directory, these define the schemas and types used inside the [Controllers](./Controllers/) and their endpoints. Now I will shortly describe the main controllers of the application.

### Authentication Controller and Models

Very simple, so far only implements a `/login` endpoint which does as the name implies, returning user details upon signing in and a Token expiring in 5 minutes.

### Transactions Controller and Models

Implements features related to the `transaction_service`, so far allows the user to get all transactions or create a new transaction, given that they have the right authorization bearer set and are of the Agent or Administrator role. This is there is checked via a global middleware, calling the `/verify` endpoint of the `authentication_service` with each call.

## Technologies used

As it is not a serious production application I thought I would keep it as simple as possible, while still studying something new. In the end I decided to give the tried and tested `C# ASP.NET Core` a go for this service. Apart from just me wanting to learn it, a great reason to use it here is because (from my limited experience) this is more typically a framework one might see used in the banking sector for its reliance and speed.

## Docs

- [ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/?view=aspnetcore-9.0)

# SS25-dsitributed-systems-assignment

This is the repository for my solution of the SS2025 Distributed Systems course assignment of Informatics BSC at IMC Krems.

The goal of it is to create a complex application with several components, subservices and utilize common APIs, services to connect them, with the theme of a fraud detection banking system.

A possible architecture for it looks as following, defined in the [assignment description](./Assignment_2.pdf):

![Image of possible architecture](./possible_architecture.png "Image of possible architecture")

## Running the application

The application is made up of several services, each with their own methods and custom settings to start with, thus running it can get quite complicated. It is recommended that you start it with the included docker compose.

> [!NOTE]
> The application by default will try and run on the following ports, make sure they are empty or change the configuration:
>
> - transaction_service: 8000
> - authentication_service: 8001
> - backend_service: 8002

### Via Docker

Simply run in the root directory of the project:

```bash
docker compose up --build
```

This simply builds the `Dockerfiles` defined in their directories, using the `.env` file next to them.

### Manually

To start a component manually check out the specific subheader for it under the [Project description](#project-description) section.

## Testing guide

As building a great UI is not part of the assignment, I opted to use Scalar and Swagger UI throughout the application. The following services have UIs:

- `transaction_service`: Swagger
- `backend_service`: Scalar

They can both be reached at the `/ui` path. Note that the `backend_service` is the one consuming all other service's API in this case, e.g. logging in is only possible through here and thus I recommend using the Scalar interface. This service has its limitations though, not all of the endpoints regarding transactions and results have been consumed here.

> [!NOTE]
> When making requests to the `transaction_service` you will have to use an `Authorization` header in the format of:
>
> "`Bearer [JWT token from signin]`"

As there is no easy frontend ui to register I recommend using these preseeded users for testing purposes:

| Username      | Password    | User Role     |
| ------------- | ----------- | ------------- |
| secretary     | password123 | secretary     |
| admin         | password123 | administrator |
| agent         | password123 | agent         |

## Project description

As previously mentioned, this example applications consists of multiple subservices. Here I will now briefly describe each of the implemented services to give a rough idea on the project, but to get to know more details about the specific component, visit the `README` in its directory.

### Authentication Service

Acts as the authentication system for the whole application. At the moment we are using a `stateless authentication` approach, creating a `JWT` token with user details and a specific expiry time, then passing that token via headers in subsequent requests.

The authentication service acts as a gateway that is called by middlewares of other services, making sure that the user has the right level of access for the given query.

To read more about this service, visit its [README file](./authentication_service/README.md).

### Transaction Service

Acts as the main business logic and orchestrator of the whole application. Handles any CRUD operations related to transactions and predicted results of whether the given transaction is fraudulent or not. Exposes API for the frontend of end users to monitor and act upon predictions provided by the fraud detection service. Also exposes a Swagger UI interface for easy interaction.

To read more about this service, visit its [README file](./transaction_service/README.md).

### Backend Service

The backend service is responsible for handling all interactions with the user through the frontend API. It exposes endpoints for the user to interact with the application and forwards those requests to their respective services to be handled, either the `Authentication Service` or the `Transaction Service`. Also exposes a Scalar UI interface for easy interaction and testing.

To read more about this service, visit its [README file](./backend_service/README.md).

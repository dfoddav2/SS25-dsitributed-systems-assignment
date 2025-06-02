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
> | Service                | Port number |
> | ---------------------- | ----------- |
> | transaction_service    | 8000        |
> | authentication_service | 8001        |
> | backend_service        | 8002        |
> | message_queue          | 8003        |
> | ml_mpi_service         | NA          |
>
> For some of the services we were given specific endpoints to run on, I made changing of these port numbers very easy, but chose to use these ports, because they are close to each other and look nice.

### Via Docker

Simply run in the root directory of the project:

```bash
docker compose up --build
```

This simply builds the `Dockerfiles` defined in their directories, using the `.env` file next to them.

### Manually

To start a component manually check out the specific subheader for it under the [Project description](#project-description) section.

## Testing guide

As building a great UI is not part of the assignment, I opted to use Scalar and Swagger UI throughout the application. The following services have UIs available at their respective `/ui` endpoints:

| Service             | UI      |
| ------------------- | ------- |
| transaction_service | Swagger |
| backend_service     | Scalar  |
| message_queue       | Scalar  |

Note that the `backend_service` is the one consuming all other service's API in this case, e.g. logging in is only possible through here and thus I recommend using the Scalar interface. This service has its limitations though, not all of the endpoints regarding transactions and results have been consumed here.

Message queue at the moment can only be interacted with through its Scalar interface.

> [!NOTE]
> When making requests to the `transaction_service` or `message_queue` you will have to use an `Authorization` header in the format of:
>
> "`Bearer [JWT token from signin]`"
>
> There is also a convenient way provided to turn off the authentication middlewares via `.env` variables.


As there is no easy frontend ui to register I recommend using these preseeded users for testing purposes:

| Username  | Password    | User Role     |
| --------- | ----------- | ------------- |
| secretary | password123 | secretary     |
| admin     | password123 | administrator |
| agent     | password123 | agent         |

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

### Message Queue

This is a simple, self-made implementation of a message broker for our application specifically. It exposes CRUD operations for creating and interacting with message queues, and of course endpoints for pushing to and pulling from them. At the moment it simply stores and provides messages, with the added capability of persistently storing queues, making it able to continue from where it left off, in case of an outage for example.

To read more about this service, visit its [README file](./message_queue/README.md).

### Machine Learning - MPI Service

This is a continously working, efficient MPI service that looks for new messages on the message queue, fetches them by batches and utilizing a prebuilt machine learning model makes a prediction on whether the transaction received through the message is fraudulent or not. Processes the messages in parallel on multiple cores utilizing MPI, then in the end automatically posts the results back on to the message queue.#

To read more about this service, visit its [README file](./ml_mpi_service/README.md).

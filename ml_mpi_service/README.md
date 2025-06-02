# Machine Learning - MPI Service

This is a continously working, efficient MPI service that looks for new messages on the message queue, fetches them by batches and utilizing a prebuilt machine learning model makes a prediction on whether the transaction received through the message is fraudulent or not. Processes the messages in parallel on multiple cores utilizing MPI, then in the end automatically posts the results back on to the message queue.

## How to run

To only run this service you can start it via the included `Dockerfile` or manually, given you have a compatible Python version (testsed on 3.13.2) and MPI for your corresponding OS. Then you will need to install the necessary packages, including `mpi4py` through the [requirements.txt](./requirements.txt).

```bash
pip install -r requirements.txt
```

Then simply run the application via `mpiexec`, defining in the command how many workers you would like to run the app with.

```bash
mpiexec -n 3 python main.py
```

This will run the command in 3 separate processes, one being the master / root and 2 worker nodes. You can either set the number of workers through here when running locally, if you are running the whole application through the main `docker-compose.yaml` file, you can set it through its respective `.env` variable in the root.

Additional settings like fallback interval, or the transaction service's url can also be set from the env variables.

> [!NOTE]
> Docker and locally running use different `.env` variables.

## Testing

For testing the application I would recommend using the complete `docker-compose` file with all of the services. To inspect how the service works you can do the following:

1. Open the Scalar frontend of the [backend_service](../backend_service/README.md), this can by default be reached through your browser at [http://localhost:8002](http://localhost:8002).
2. "Log in" with one of the prefilled users, e.g. `agent` - `password123`, copy the received bearer token.
3. Now you may use the `transaction_service` and just randomly push messages to the `transactions` queue of the `message_queue`.
4. All the while pushing messages to the queue, you may inspect the logs of the `ml_mpi_service` or even query the `results` queue through the `transaction_service` frontend.

You should see how messages are pulled by a maximum of n chunks based on how many workers we start the service with and, after processing these in separate processes we push them back to the target queue.

TODO: Implement these
> [!NOTE]
> This all is a bit convoluted, so to speed up testing you can simply turn off the authentication middleware on the `transaction_service` through the `.env` variable.
>
> The queues are by default set to have a maximum size of 5, once the results queue has been filled, the service will no longer pull new messages.

## How it Works



## Technologies Used

As the example we saw for `mpi` in class was `mpi4py` for Python, I decided to use it too. It seems to do its job fine. Another reason for using Ptyhon is how the machine learning prediction and data transformation is quite easy to do with `joblib`, `numpy` and `pandas`.

## Docs

- [mpi4py](https://mpi4py.readthedocs.io/en/stable/mpi4py.html)
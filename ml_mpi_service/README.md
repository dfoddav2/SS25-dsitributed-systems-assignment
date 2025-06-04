# Machine Learning - MPI Service

This is a continously working, efficient MPI service that looks for new messages on the message queue, fetches them by batches and utilizing a prebuilt machine learning model makes a prediction on whether the transaction received through the message is fraudulent or not. It processes the messages in parallel on multiple cores utilizing MPI, then in the end automatically posts the results back on to the message queue.

> [!NOTE]
> Implementation of this service also came with some changes in the `message_queue`, namely long polling implementation, the `push-n` and `pull-n` endpoints to make queries more efficient and the ability to turn off the `auth_middleware` via an env variable.

## How to run

To only run this service you can start it via the included `Dockerfile` or manually, given you have a compatible Python version (testsed on 3.13.2) and MPI implementation for your corresponding OS. Then you will need to install the necessary packages, including `mpi4py` through the [requirements.txt](./requirements.txt).

```bash
pip install -r requirements.txt
```

Then simply run the application via `mpiexec`, defining in the command how many workers you would like to run the app with.

```bash
mpiexec -n 3 python main.py
```

This will run the command in 3 separate processes, one being the master / root and 2 worker nodes. You can either set the number of workers through here when running locally, if you are running the whole application through the main `docker-compose.yaml` file, you can set it through its respective `.env` variable in the root.

Additional settings like fallback interval, or the message queue's url can also be set from the env variables.

> [!NOTE]
> Docker and locally running use different `.env` variables. Due to name resolution differences.
>
> Building the Docker image of this project may take some time (even as long as 5-10 minutes), as it needs to install mpi and all other necessary packages. Apparently, there are images with some mpi implementation preinstalled, I tested [dhna/mpi4py](https://hub.docker.com/r/dhna/mpi4py) and [mfisherman/openmpi](https://hub.docker.com/r/mfisherman/openmpi) + manually installing Python, but did not have much success with them.

## Testing

For testing the application I would recommend using the complete `docker-compose` file with all of the services. To inspect how the service works you can do the following:

1. Open the Scalar frontend of the [backend_service](../backend_service/README.md), this can by default be reached through your browser at [http://localhost:8002/ui](http://localhost:8002/ui).
2. "Log in" with one of the prefilled users, e.g. `agent` - `password123`, copy the received bearer token.
3. Now you may use the `transaction_service` and just randomly push messages to the `transactions` queue of the `message_queue`.
4. All the while pushing messages to the queue, you may inspect the logs of the `ml_mpi_service` or even query the `results` queue through the `transaction_service` frontend.

You should see how messages are pulled by a maximum of n chunks based on how many workers we start the service with and, after processing these in separate processes we push them back to the target queue.

> [!NOTE]
> This all is a bit convoluted, so to speed up testing you can simply turn off the authentication middleware on the `transaction_service` and `message_queue` through the `.env` variables.
>
> The queues are by default set to have a maximum size of 5, once the results queue has been filled, the service should in theory no longer receive new messages, but to not just simply drop those messages, I have decided to make the results queue exempt from this rule.

## How it Works

The MPI implementation starts the program in the defined number of N processes and utilizing the package `mpi4py` we can easily get needed metadata and communicate between these processes. Two of the most important pieces of metadata are the `size` - how many processes - and `rank` - the rank of the process executing the task. The process with Rank 0 is designated to be the `master` and others as `workers`, we split the execution of the code into two different branches. The master orchestrates the work, designating worker nodes to handle a task, then acting upon the results.

| Identity | Num | Task                                                                                                                     |
| -------- | --- | ------------------------------------------------------------------------------------------------------------------------ |
| Master   | 1   | Continously fetches messages, delegates them as tasks to workers, gathers the results and pushes them back to the queue. |
| Worker   | N-1 | Loads the prediction ML model and waits for tasks from the Master node, processes tasks and returns prediction.          |

Now in the following two subsections I will explain two of the more interesting design choices I have made.

### Long Polling

My first thought when reading the assignment was that I surely want to do something a bit more interesting than simple interval pulling of tasks from the message queue. It would have been easy to implement, but not really efficient.

Looking into different apporaches I found the option of [Long Polling](https://ably.com/topic/long-polling) as a simple yet performant alternative somewhere in between web sockets and interval short polling.

Essentially on my message queue utilizing a separate dedicated Redis client I do a blocking busy wait for 30 seconds with `BRPOP` like such:

```ts
    const brpopResult = await blockingRedisClient.sendCommand([
    "BRPOP",
    queueName,
    timeout.toString(),
    ]);
```

This waits half a minute for the DB to have a message available in the `transactions_queue`, if there in't one in the given time, a `204` is returned that is handled by this service as a very short timeout and then restarting the wait. Of course, this service has a built-in timeout that is a bit longer than the of the queue and there is a fallback timeout in case the `message_queue` is not working at all.

### Scatter - Gather

I initially used Scatter - Gather disrtibuting the tasks to all of the worker nodes, but this way I had to assign empty jobs based on how many jobs have been fetched, essentially sending nothing to a worker for processing just for it to return nothing. This is not such a good design so instead I used a loop and the `send`, `recv` commands to directly communicate with each worker one-by-one.

```py
    # Send out tasks to the worker nodes
    for i in range(workers_to_use):
        worker_rank = active_worker_ranks[i]
        COMM.send(tasks_to_process[i], dest=worker_rank, tag=1)

    # Collect results from the workers we sent tasks to
    for i in range(workers_to_use):
        worker_rank = active_worker_ranks[i]
        try:
            prediction_result = COMM.recv(
                source=worker_rank, tag=2)
            results_from_workers.append(prediction_result)
```

This is a bit cleaner as it only ever uses as many workers as the batch of tasks needs.

## Technologies Used

As the example we saw for `mpi` in class was `mpi4py` for Python, I decided to use it too. It seems to do its job fine. Another reason for using Ptyhon is how the machine learning prediction and data transformation is quite easy to do with `joblib`, `numpy` and `pandas`.

## Further Considerations

The assignment did not outline the need for a comprehensive way on how to handle edge cases and the possibility of the results queue being full (e.g. for this service to have a database of its own temporarily storing results until it can be sent), thus I have decided to simply disregard these issues or do the simplest approach in annoying cases, such as the results queue filling, for which I have removed the max size cap. 

## Docs

- [mpi4py](https://mpi4py.readthedocs.io/en/stable/mpi4py.html)

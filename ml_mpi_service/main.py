import os
import json
import time
import joblib
import requests
from mpi4py import MPI
from dotenv import load_dotenv
from datetime import datetime
import numpy as np
import pandas as pd

# --- Configuration ---
load_dotenv()
STATUSES = ['submitted', 'accepted', 'rejected']
FEATURE_NAMES = ['timestamp', 'status', 'vendor_id', 'amount']

# Initialize MPI
COMM = MPI.COMM_WORLD
RANK = COMM.Get_rank()
SIZE = COMM.Get_size()
STOP_WORKER_SIGNAL = "STOP_WORKER_SIGNAL_XYZ"

# Environment variables with defaults
MQ_SERVICE_URL = os.getenv("MQ_SERVICE_URL", "http://localhost:8003")
TRANSACTIONS_QUEUE_NAME = os.getenv(
    "TRANSACTIONS_QUEUE_NAME", "transactions_queue")
RESULTS_QUEUE_NAME = os.getenv("RESULTS_QUEUE_NAME", "results_queue")
MODEL_PATH = os.getenv("MODEL_PATH", "fraud_rf_model.pkl")
HTTP_CLIENT_TIMEOUT = float(os.getenv("HTTP_CLIENT_TIMEOUT", "35.0"))
FALLBACK_POLL_INTERVAL_SECONDS = float(
    os.getenv("FALLBACK_POLL_INTERVAL_SECONDS", "1.0"))


def load_model(filename=MODEL_PATH):
    if not os.path.exists(filename):
        print(
            f"[Process {RANK}] ERROR: Model file '{filename}' not found. Aborting MPI execution.")
        COMM.Abort(1)  # Abort all MPI processes
        raise FileNotFoundError(
            f'Model file with path "{filename}" not found.')
    try:
        model = joblib.load(filename)
        print(f"[Process {RANK}] Model '{filename}' loaded successfully.")
        return model
    except Exception as e:
        print(
            f"[Process {RANK}] ERROR: Failed to load model '{filename}': {e}. Aborting MPI execution.")
        COMM.Abort(1)
        raise


def fetch_batch_from_deno_mq(session, count):
    """Fetches a batch of tasks from the Deno Message Queue service using /pull-n."""
    if count <= 0:
        return []
    try:
        pull_url = f"{MQ_SERVICE_URL}/pull-n?queue-name={TRANSACTIONS_QUEUE_NAME}&count={count}"
        print(
            f"[MASTER {RANK}] Calling /pull-n: {pull_url} with timeout {HTTP_CLIENT_TIMEOUT}s")
        response = session.get(pull_url, timeout=HTTP_CLIENT_TIMEOUT)

        if response.status_code == 200:
            tasks = response.json()  # Expecting a list of tasks
            if isinstance(tasks, list):
                # print(f"[MASTER {RANK}] Fetched {len(tasks)} tasks via /pull-n.")
                try:
                    tasks = [json.loads(task) for task in tasks]
                except json.JSONDecodeError as e:
                    print(
                        f"[MASTER {RANK}] Error decoding JSON in tasks: {e}. Tasks: {tasks}")
                    return []
                return tasks
            else:
                print(
                    f"[MASTER {RANK}] Error: /pull-n did not return a list. Got: {type(tasks)}")
                return []  # Return empty list on unexpected format
        elif response.status_code == 204:  # No content, queue was empty during long poll
            # print(f"[MASTER {RANK}] /pull-n returned 204 No Content (queue empty).")
            return []
        else:
            print(
                f"[MASTER {RANK}] Error fetching batch from Deno MQ (/pull-n): {response.status_code} - {response.text}")
            return []
    except requests.exceptions.Timeout:
        print(
            f"[MASTER {RANK}] HTTP Request to /pull-n timed out after {HTTP_CLIENT_TIMEOUT}s.")
        return []
    except requests.exceptions.RequestException as e:
        print(
            f"[MASTER {RANK}] HTTP Request failed when pulling batch (/pull-n): {e}")
        return []
    except json.JSONDecodeError as e:
        print(
            f"[MASTER {RANK}] Failed to decode JSON response from Deno /pull-n: {e}")
        return []


def push_batch_to_deno_mq(session, results_batch):
    """Pushes a batch of prediction results to the Deno Message Queue service using /push-n."""
    if not results_batch:
        return True  # Nothing to push
    try:
        push_url = f"{MQ_SERVICE_URL}/push-n"  # Assuming /push-n endpoint
        # Deno /push-n should expect a payload like:
        # {"queue_name": "results_queue", "messages": [result1, result2, ...]}
        payload = {
            "queue_name": RESULTS_QUEUE_NAME,
            "messages": results_batch  # Send the list of result dicts
        }
        # print(f"[MASTER {RANK}] Pushing batch of {len(results_batch)} results to /push-n.")
        # Increased timeout for batch
        response = session.post(push_url, json=payload,
                                timeout=HTTP_CLIENT_TIMEOUT)
        if response.status_code == 201:
            print(
                f"[MASTER {RANK}] Successfully pushed batch of {len(results_batch)} results.")
            return True
        else:
            print(
                f"[MASTER {RANK}] Error pushing batch to Deno MQ (/push-n): {response.status_code} - {response.text}")
            return False
    except requests.exceptions.RequestException as e:
        print(
            f"[MASTER {RANK}] HTTP Request failed when pushing batch (/push-n): {e}")
        return False


def run_master_node():
    num_workers = SIZE - 1
    print(
        f"[MASTER {RANK}] Initialized. Number of workers: {num_workers}. Using Deno MQ at {MQ_SERVICE_URL}")
    active_worker_ranks = list(range(1, SIZE))
    http_session = requests.Session()

    try:
        while True:
            # Fetch a batch of tasks, up to the number of workers
            # Fetch 1 if no workers (though master shouldn't run alone)
            tasks_to_process = fetch_batch_from_deno_mq(
                http_session, num_workers if num_workers > 0 else 1)

            if not tasks_to_process:
                # print(f"[MASTER {RANK}] No tasks fetched from /pull-n. Deno MQ might be empty or timed out (204).")
                time.sleep(FALLBACK_POLL_INTERVAL_SECONDS)
                continue

            num_actual_tasks = len(tasks_to_process)
            print(
                f"[MASTER {RANK}] Fetched {num_actual_tasks} tasks via /pull-n. Distributing to workers.")

            results_from_workers = []
            # Distribute tasks only to the number of available tasks, up to num_workers
            workers_to_use = min(num_actual_tasks, num_workers)

            if num_workers > 0 and workers_to_use > 0:
                for i in range(workers_to_use):  # Iterate based on actual tasks to send
                    worker_rank = active_worker_ranks[i]
                    COMM.send(tasks_to_process[i], dest=worker_rank, tag=1)

                # Collect results from the workers we sent tasks to
                for i in range(workers_to_use):
                    worker_rank = active_worker_ranks[i]
                    try:
                        prediction_result = COMM.recv(
                            source=worker_rank, tag=2)
                        results_from_workers.append(prediction_result)
                    except MPI.Exception as e:
                        print(
                            f"[MASTER {RANK}] ERROR: MPI Exception while receiving from worker {worker_rank}: {e}")
                        results_from_workers.append({
                            "transaction_id": tasks_to_process[i].get('id', 'N/A') if i < len(tasks_to_process) else 'unknown_id_on_mpi_error',
                            "error": f"Failed to receive result from worker {worker_rank}",
                            "is_fraudulent": -1, "confidence": 0.0
                        })
            elif num_workers == 0:  # Should be handled by SIZE == 1 case, but as a safeguard
                print(
                    f"[MASTER {RANK}] Warning: Master node running without workers. This case should be handled by standalone mode.")
                pass

            if results_from_workers:
                if push_batch_to_deno_mq(http_session, results_from_workers):
                    print(
                        f"[MASTER {RANK}] Pushed batch of {len(results_from_workers)} results successfully via /push-n.")
                else:
                    print(
                        f"[MASTER {RANK}] Failed to push batch of {len(results_from_workers)} results via /push-n.")

            # print(f"[MASTER {RANK}] Batch processed. {num_actual_tasks} tasks handled.")

    except KeyboardInterrupt:
        print(f"[MASTER {RANK}] KeyboardInterrupt. Shutting down workers...")
    finally:
        if num_workers > 0:
            # Determine how many workers might have been active in the last batch
            # This is a best-effort for clean shutdown message.
            active_count_for_shutdown = workers_to_use if 'workers_to_use' in locals(
            ) and workers_to_use > 0 else num_workers
            print(
                f"[MASTER {RANK}] Sending STOP signal to up to {active_count_for_shutdown} workers.")
            for i in range(num_workers):  # Iterate through all potential workers
                worker_rank = active_worker_ranks[i]
                try:
                    # Non-blocking send in case worker already exited
                    COMM.isend(STOP_WORKER_SIGNAL, dest=worker_rank, tag=1)
                except MPI.Exception as e:
                    print(
                        f"[MASTER {RANK}] Note: Failed to send STOP signal to worker {worker_rank} (may have already exited): {e}")
        http_session.close()
        print(f"[MASTER {RANK}] Shutdown complete.")


def preprocess_transaction_data(transaction_data: dict):
    """
    Preprocesses a single transaction dictionary into a feature vector for the model.
    The order of features must match the training: id, vendor_id, timestamp, status, amount.
    """
    print(
        f"[Process {RANK}] Preprocessing transaction data: {transaction_data.get('id')}")
    try:
        # 1. Timestamp processing: Convert ISO string to Unix timestamp (float)
        # Example: "2023-01-01T12:00:00Z"
        dt_object = datetime.fromisoformat(
            transaction_data.get('timestamp', '').replace('Z', '+00:00'))
        timestamp_numeric = dt_object.timestamp()

        # 2. Status processing: Map string to integer
        status_mapping = {status: idx for idx, status in enumerate(STATUSES)}
        status_numeric = status_mapping.get(transaction_data.get(
            'status', '').lower(), -1)  # Default to -1 if unknown
        if status_numeric == -1:
            print(
                f"[Process {RANK}] Warning: Unknown status '{transaction_data.get('status')}' for transaction {transaction_data.get('id')}. Using -1.")

        # 3. Extract other features, ensuring correct types
        feature_values = [
            timestamp_numeric,
            status_numeric,
            transaction_data.get('vendor_id', 0),
            float(transaction_data.get('amount', 0.0))
        ]

        df_features = pd.DataFrame([feature_values], columns=FEATURE_NAMES)
        return df_features
    except Exception as e:
        print(
            f"[Process {RANK}] Error preprocessing transaction {transaction_data.get('id', 'N/A')}: {e}")
        return None


def make_prediction(model, features_df: pd.DataFrame, transaction_id="N/A"):
    """
    Makes a prediction using the loaded model and preprocessed features (Pandas DataFrame).
    """
    print(
        f"[Process {RANK}] Making prediction for transaction: {transaction_id}")
    if model is None:
        print(
            f"[Process {RANK}] Error: Model not loaded for transaction {transaction_id}.")
        return {"transaction_id": transaction_id, "error": "Model not loaded", "is_fraudulent": -1, "confidence": 0.0}
    if not isinstance(features_df, pd.DataFrame):
        print(
            f"[Process {RANK}] Error: Features for transaction {transaction_id} are not a Pandas DataFrame.")
        return {"transaction_id": transaction_id, "error": "Invalid feature format (not DataFrame)", "is_fraudulent": -1, "confidence": 0.0}

    try:
        # Scikit-learn models directly accept DataFrames with correct column names
        prediction = model.predict(features_df)
        probabilities = model.predict_proba(features_df)

        is_fraudulent = int(prediction[0])
        confidence = float(probabilities[0][is_fraudulent])

        print(
            f"[Process {RANK}] Prediction for {transaction_id}: Fraudulent={is_fraudulent}, Confidence={confidence:.4f}")
        return {"transaction_id": transaction_id, "timestamp": datetime.now().isoformat(), "is_fraudulent": is_fraudulent, "confidence": confidence}
    except Exception as e:
        print(
            f"[Process {RANK}] Error during prediction for transaction {transaction_id}: {e}")
        return {"transaction_id": transaction_id, "error": str(e), "is_fraudulent": -1, "confidence": 0.0}


def run_worker_node(model):
    print(f"[WORKER {RANK}] Initialized. Waiting for tasks.")
    try:
        while True:
            task_data = COMM.recv(source=0, tag=1)

            if task_data == STOP_WORKER_SIGNAL:
                print(f"[WORKER {RANK}] Received STOP signal. Exiting.")
                break

            # print("Data received by worker:", type(task_data), task_data)
            transaction_id = task_data.get("id", "N/A")
            features = preprocess_transaction_data(task_data)
            if not features.empty:
                prediction_result = make_prediction(
                    model, features, transaction_id)
            else:
                prediction_result = {
                    "transaction_id": transaction_id, "timestamp": datetime.now().isoformat(),
                    "is_fraudulent": -1, "confidence": 0.0
                }

            COMM.send(prediction_result, dest=0, tag=2)

    except MPI.Exception as e:
        print(f"[WORKER {RANK}] MPI Exception: {e}. Worker is terminating.")
    except Exception as e:
        print(f"[WORKER {RANK}] Unexpected error: {e}. Worker is terminating.")
    finally:
        print(f"[WORKER {RANK}] Shutdown.")


def run_standalone_node(model):
    """Logic for when SIZE = 1 (single process mode, uses HTTP batch endpoints)."""
    print(
        f"[STANDALONE {RANK}] Running in single process mode. Using Deno MQ at {MQ_SERVICE_URL}")
    http_session = requests.Session()
    try:
        while True:
            # Fetch one task using the batch endpoint
            tasks_batch = fetch_batch_from_deno_mq(http_session, count=1)

            if not tasks_batch:
                # print(f"[STANDALONE {RANK}] No task fetched. Sleeping for {FALLBACK_POLL_INTERVAL_SECONDS}s.")
                time.sleep(FALLBACK_POLL_INTERVAL_SECONDS)
                continue

            task_data = tasks_batch[0]  # Get the single task from the list
            transaction_id = task_data.get("id", "N/A")
            print(
                f"[STANDALONE {RANK}] Processing task for transaction: {transaction_id}")

            features = preprocess_transaction_data(task_data)
            if features:
                prediction_result = make_prediction(
                    model, features, transaction_id)
            else:
                prediction_result = {
                    "transaction_id": transaction_id, "timestamp": datetime.now().isoformat(),
                    "is_fraudulent": -1, "confidence": 0.0
                }

            # Push the single result using the batch endpoint
            # Send as a list
            if push_batch_to_deno_mq(http_session, [prediction_result]):
                print(
                    f"[STANDALONE {RANK}] Pushed result for transaction {transaction_id} via /push-n.")
            else:
                print(
                    f"[STANDALONE {RANK}] Failed to push result for transaction {transaction_id} via /push-n.")

    except KeyboardInterrupt:
        print(f"[STANDALONE {RANK}] KeyboardInterrupt. Shutting down.")
    finally:
        http_session.close()
        print(f"[STANDALONE {RANK}] Shutdown complete.")


# --- Main Execution ---
if __name__ == "__main__":
    # Load the model only if RANK > 0 (workers) or SIZE == 1 (standalone node)
    ml_model = None
    if RANK > 0 or SIZE == 1:  # Workers and standalone node load the model
        ml_model = load_model(MODEL_PATH)  # Define or import load_model
        if not ml_model and SIZE > 1:  # If worker fails to load model
            print(
                f"[WORKER {RANK}] Failed to load model. Worker cannot proceed.")
            COMM.Abort(1)  # Signal other processes to abort
        elif not ml_model and SIZE == 1:
            print(f"[STANDALONE {RANK}] Failed to load model. Cannot proceed.")
            exit(1)

    # Split execution based on the number of processes / and RANK
    if SIZE == 1:
        if ml_model:
            run_standalone_node(ml_model)
    else:  # SIZE > 1
        if RANK == 0:  # Master
            run_master_node()
        else:  # Workers
            if ml_model:  # Ensure model was loaded
                run_worker_node(ml_model)

    print(f"[Process {RANK}] Finalizing.")

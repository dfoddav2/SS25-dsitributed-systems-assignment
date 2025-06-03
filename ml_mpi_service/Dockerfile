FROM python:3.13-alpine

# Install MPI dependencies
RUN apk update && \
    apk add --no-cache build-base openmpi openmpi-dev python3-dev openssh-client && \
    adduser -D mpiuser


# Set environment variables for MPI
# ENV MPICC=mpicc

# Set working directory
WORKDIR /app

# Copy requirements and install them.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy your code.
COPY . .

# Switch to non-root user
USER mpiuser

# Run the MPI service with 5 processes by default
CMD ["sh", "-c", "mpirun -np ${MPI_PROCS:-5} python main.py"]
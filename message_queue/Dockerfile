FROM denoland/deno:2.2.5

# The port that your application listens to.
EXPOSE 8003

WORKDIR /app

# Prefer not to run as root.
USER root
RUN chown -R deno:deno /app
USER deno

# Cache the dependencies as a layer (the following two steps are re-run only when deps.ts is modified).
# Ideally cache deps.ts will download and compile _all_ external files used in main.ts.
# COPY deps.ts .
# RUN deno install --entrypoint deps.ts

# These steps will be re-run upon each file change in your working directory:
COPY . .


# Compile the main app so that it doesn't need to be compiled each startup/entry.
RUN deno cache main.ts

CMD ["run", "--allow-env", "--allow-net", "--allow-read", "--allow-write", "--env-file", "main.ts"]
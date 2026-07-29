FROM python:3.12-slim

WORKDIR /app

# FIX #6: Add libpq-dev so psycopg[binary] can link against the PostgreSQL
# client library at install time. Without it, the pip install step succeeds
# (binary wheel ships its own libpq) but the runtime import fails on
# python:3.12-slim because the shared library is not present.
# curl is included so the Docker healthcheck can probe the Django dev server.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# FIX #7: Run migrate before starting the server.
# Without this, the first boot against a fresh PostgreSQL volume fails with
# "relation does not exist" because Django tries to query tables that haven't
# been created yet.
# We use a shell entrypoint (sh -c) so both commands run in the same PID 1
# process group and the container exits cleanly if either command fails.
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py runserver 0.0.0.0:8000"]
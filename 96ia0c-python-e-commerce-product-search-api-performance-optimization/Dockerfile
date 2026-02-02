FROM python:3.11-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1
ENV PYTEST_ADDOPTS="-o cache_dir=/tmp/pytest_cache"
ENV PYTHONPYCACHEPREFIX=/tmp/pycache

RUN apt-get update \
        && apt-get install -y --no-install-recommends postgresql redis-server \
        && pg_bin="$(ls -d /usr/lib/postgresql/*/bin | head -n 1)" \
        && ln -s "$pg_bin/initdb" /usr/local/bin/initdb \
        && ln -s "$pg_bin/postgres" /usr/local/bin/postgres \
        && ln -s "$pg_bin/createdb" /usr/local/bin/createdb \
        && ln -s "$pg_bin/psql" /usr/local/bin/psql \
        && ln -s "$pg_bin/pg_isready" /usr/local/bin/pg_isready \
        && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app
RUN chown -R postgres:postgres /app
USER postgres
CMD ["pytest", "-q", "tests"]

FROM debian:bookworm-slim

RUN apt-get update \
        && apt-get install -y --no-install-recommends \
                build-essential \
                make \
        && rm -rf /var/lib/apt/lists/*

WORKDIR /app

CMD ["sh"]

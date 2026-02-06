FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    g++ \
    make \
    libgtest-dev \
    cmake \
    && cd /usr/src/googletest && cmake . && make && \
    cp lib/libgtest*.a /usr/lib/ \
    && apt-get remove -y cmake \
    && apt-get autoremove -y \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . /app

CMD ["make", "test"]

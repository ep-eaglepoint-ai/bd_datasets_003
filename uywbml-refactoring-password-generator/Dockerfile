FROM python:3.11-slim
WORKDIR /app

# Install Tcl/Tk for tkinter support
RUN apt-get update && apt-get install -y --no-install-recommends \
    tk \
    libtk8.6 \
    tcl8.6 \
    && rm -rf /var/lib/apt/lists/*

COPY . /app
RUN pip install --no-cache-dir -r requirements.txt
CMD ["pytest", "-q", "tests"]

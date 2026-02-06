FROM python:3.11-slim
WORKDIR /app

# Install Tcl/Tk for tkinter support and xvfb for headless GUI testing
RUN apt-get update && apt-get install -y --no-install-recommends \
    tk \
    libtk8.6 \
    tcl8.6 \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Set DISPLAY environment variable for xvfb
ENV DISPLAY=:99

COPY . /app
RUN pip install --no-cache-dir -r requirements.txt

# Start xvfb in the background and run tests
CMD ["xvfb-run", "-a", "pytest", "-q", "tests"]

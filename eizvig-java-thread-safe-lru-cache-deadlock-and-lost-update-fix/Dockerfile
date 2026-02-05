FROM maven:3.9-eclipse-temurin-17

# Install Python for evaluation script
RUN apt-get update && apt-get install -y python3 python3-pip

WORKDIR /app

# The context will be mounted, so we don't need to copy everything here for dev
# But for the image build we can copy requirements if needed
COPY requirements.txt .
# If requirements.txt exists and is not empty, install. (It might be empty based on list_dir)
# But we need basic python env. pytest is used in the prompt example, let's ensure it's installed.
# Added --break-system-packages to verify install on newer Debian/Ubuntu base images
RUN pip3 install pytest --break-system-packages

# Copy everything
COPY . .

# Default command
CMD ["mvn", "-version"]

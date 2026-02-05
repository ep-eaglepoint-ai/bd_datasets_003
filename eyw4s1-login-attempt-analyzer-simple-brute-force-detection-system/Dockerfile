FROM python:3.11-slim

# Install curl and Node.js for frontend
RUN apt-get update && apt-get install -y curl \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt

# Install frontend dependencies during build
COPY repository_after/frontend/package*.json ./repository_after/frontend/
RUN cd repository_after/frontend && npm install && ls -la node_modules/.bin/

# Copy all application files
COPY . /app

# Verify node_modules exists after copy
RUN ls -la /app/repository_after/frontend/node_modules/.bin/

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"] 

FROM python:3.11.8-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
	PYTHONUNBUFFERED=1

WORKDIR /app
COPY . /app

CMD ["python", "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", "-q"]

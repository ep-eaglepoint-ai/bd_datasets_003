#!/bin/bash

REPO_DIR="/Users/mac/my_django_project/bd_dataset_03/Day 1 - Monday/Task 3 - Login Attempt Analyzer/bd_datasets_003/eyw4s1-login-attempt-analyzer-simple-brute-force-detection-system/repository_after"

echo "Starting Django backend..."
cd "$REPO_DIR/backend" && python3 manage.py runserver &
BACKEND_PID=$!

sleep 3

echo "Starting Vue.js frontend..."
cd "$REPO_DIR/frontend" && npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Both servers started!"
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Backend running at: http://127.0.0.1:8000"
echo "Frontend running at: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers"

wait

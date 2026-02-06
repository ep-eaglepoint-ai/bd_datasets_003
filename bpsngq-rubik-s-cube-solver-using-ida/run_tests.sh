#!/bin/bash

# Robustly run tests using the python module to avoid PATH issues
echo "Running Rubik's Cube Solver tests..."
python3 -m pytest "$@"

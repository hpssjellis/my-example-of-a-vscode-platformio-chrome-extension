#!/bin/bash

# --- FORCE CPU ONLY MODE FOR TENSORFLOW ---
# Instructs TensorFlow to ignore all CUDA-enabled GPUs, ensuring CPU usage.
export CUDA_VISIBLE_DEVICES=""

# --- SCALABLE VIRTUAL ENVIRONMENT ACTIVATION ---
# 1. Get the directory where THIS script lives. This makes the script portable.
MY_SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
VENV_ACTIVATE_PATH="$MY_SCRIPT_DIR/bin/activate"

# Verify activation path exists before sourcing
if [ ! -f "$VENV_ACTIVATE_PATH" ]; then
    echo "ERROR: VENV activation script NOT found at: $VENV_ACTIVATE_PATH"
    exit 1
fi

# 2. Activate the virtual environment
source "$VENV_ACTIVATE_PATH"

# --- ARGUMENT HANDLING ---

# Check for FOUR arguments: Python file, Input path, Output path, Model Name
if [ "$#" -ne 4 ]; then
    echo "Usage: ./run_converter.sh <python_script_path> <input_path> <output_path> <model_name>"
    deactivate # Clean up environment if possible
    exit 1
fi

PYTHON_SCRIPT_PATH="$1"
INPUT_PATH="$2"
OUTPUT_PATH="$3"
MODEL_NAME="$4" # New argument

# 3. Run the Python script, passing ALL necessary paths/names as arguments
# We pass the Model Name to Python so it can confirm it matches its expected output.
/usr/bin/python3 "$PYTHON_SCRIPT_PATH" "$INPUT_PATH" "$OUTPUT_PATH" "$MODEL_NAME"

# 4. Deactivate the environment
deactivate
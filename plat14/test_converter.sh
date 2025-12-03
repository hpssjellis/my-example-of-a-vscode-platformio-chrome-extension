#!/bin/bash

# Check for three arguments: Python file path, Input path, Output path
if [ "$#" -ne 3 ]; then
    echo "Usage: ./run_converter.sh <python_script_path> <input_path> <output_path>"
    exit 1
fi

PYTHON_SCRIPT_PATH="$1"
INPUT_PATH="$2"
OUTPUT_PATH="$3"

# 1. Activate the virtual environment using a relative path
# Since run_converter.sh is now in the parent folder of 'bin', this works:
source ./bin/activate

# 2. Run the Python script, passing the paths as arguments
/usr/bin/python3 "$PYTHON_SCRIPT_PATH" "$INPUT_PATH" "$OUTPUT_PATH"

# 3. Deactivate the environment (optional)
deactivate
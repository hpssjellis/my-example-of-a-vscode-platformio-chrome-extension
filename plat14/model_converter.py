# ==============================================================================
# TENSORFLOW.JS TO KERAS CONVERTER
#
# This script is executed within the Windows Subsystem for Linux (WSL)
# and performs the conversion from TensorFlow.js format (JSON/binaries)
# to a Keras H5 file, which is necessary for TFLite conversion.
#
# Arguments (received from the Node.js bridge via run_converter.sh):
#   sys.argv[1]: Input Folder Path (WSL path to the TF.js model directory)
#   sys.argv[2]: Output File Path (WSL path where the final .h5 file should be saved)
#   sys.argv[3]: Model Name (The expected name of the model for logging)
#
# Usage (called by run_converter.sh):
# python3 model_converter.py <input_path> <output_path> <model_name>
# ==============================================================================

import sys
import os
# Set environment variable to suppress non-critical TensorFlow logs
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
import tensorflow as tf
import tensorflowjs as tfjs

def convert_tfjs_to_keras(input_path, output_path, model_name):
    """
    Loads a TensorFlow.js model and saves it as a Keras H5 file.

    :param input_path: Path to the directory containing model.json.
    :param output_path: Full path to the output Keras .h5 file.
    :param model_name: The expected name of the model for logging.
    """
    
    print(f"Python: Starting conversion for model: {model_name}")
    print(f"Python: Input path (TF.js folder): {input_path}")
    print(f"Python: Output path (Keras .h5 file): {output_path}")

    try:
        # Load the model from the TF.js format
        # This function works by finding the model.json file in the input_path.
        print("Python: Loading TensorFlow.js model...")
        my_keras_model = tfjs.converters.load_keras_model(input_path)
        print("Python: Model loaded successfully.")

        # Save the model in the Keras H5 format
        print(f"Python: Saving model to H5 format at {output_path}...")
        my_keras_model.save(output_path)
        print("Python: Model saved successfully to H5.")
        
        # Check file existence and size (optional but helpful)
        if os.path.exists(output_path):
            file_size_bytes = os.path.getsize(output_path)
            file_size_kb = file_size_bytes / 1024.0
            print(f"Python: Verification: Output file size is {file_size_kb:.2f} KB.")
        else:
            print("Python ERROR: Output file was not found after saving.")
            sys.exit(1)

        print("Python: Conversion process finished.")
        
    except Exception as e:
        print(f"Python ERROR: An unexpected error occurred during conversion: {e}", file=sys.stderr)
        # Exit with a non-zero status code to signal failure to the shell/Node.js
        sys.exit(1)

if __name__ == "__main__":
    # sys.argv[0] is the script name itself
    if len(sys.argv) != 4:
        print(f"Python ERROR: Expected 3 arguments (input_path, output_path, model_name), but received {len(sys.argv) - 1}.", file=sys.stderr)
        sys.exit(1)
    
    # Arguments received from run_converter.sh
    input_folder = sys.argv[1]
    output_file = sys.argv[2]
    model_name = sys.argv[3]
    
    convert_tfjs_to_keras(input_folder, output_file, model_name)
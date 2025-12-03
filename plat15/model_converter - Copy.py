# ==============================================================================
# TENSORFLOW.JS TO KERAS CONVERTER
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
    
    # Check if model.json exists
    model_json_path = os.path.join(input_path, 'model.json')
    print(f"Python DEBUG: model.json path: {model_json_path}")
    print(f"Python DEBUG: model.json exists? {os.path.exists(model_json_path)}")
    
    if not os.path.exists(model_json_path):
        print(f"Python ERROR: model.json not found at {model_json_path}")
        sys.exit(1)

    try:
        # CREATE OUTPUT DIRECTORY IF IT DOESN'T EXIST
        output_dir = os.path.dirname(output_path)
        
        if not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)
            print(f"Python: Created output directory: {output_dir}")
        
        # Verify output_path is NOT a directory
        if os.path.isdir(output_path):
            print(f"Python ERROR: output_path is a directory, not a file path: {output_path}")
            sys.exit(1)
        
        # Load the model from the TF.js format
        # IMPORTANT: Pass the model.json file path, not just the directory
        print("Python: Loading TensorFlow.js model...")
        print(f"Python DEBUG: Calling load_keras_model with: {model_json_path}")
        my_keras_model = tfjs.converters.load_keras_model(model_json_path)
        print("Python: Model loaded successfully.")

        # Save the model in the Keras H5 format
        print(f"Python: Saving model to H5 format at {output_path}...")
        my_keras_model.save(output_path)
        print("Python: Model saved successfully to H5.")
        
        # Check file existence and size
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
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(f"Python ERROR: Expected 3 arguments (input_path, output_path, model_name), but received {len(sys.argv) - 1}.", file=sys.stderr)
        sys.exit(1)
    
    input_folder = sys.argv[1]
    output_file = sys.argv[2]
    model_name = sys.argv[3]
    
    convert_tfjs_to_keras(input_folder, output_file, model_name)
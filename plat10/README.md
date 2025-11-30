PlatformIO \& TFLite Tools - Chrome Extension

A Chrome extension that provides two powerful development tools:



Arduino Code Compiler \& Flasher - Compile and upload Arduino code to boards via PlatformIO

TensorFlow.js to TFLite Converter - Convert TF.js models to TensorFlow Lite format



Both features work through a local Node.js bridge server that interfaces with PlatformIO CLI and Python/TensorFlow.



📋 Table of Contents



Features

System Requirements

Installation Guide



Install PlatformIO Core

Install Python \& TensorFlow

Install Node.js Dependencies

Set Up Bridge Server

Install Chrome Extension





Usage



Arduino Development

TFLite Conversion





Troubleshooting

File Structure

API Endpoints





✨ Features

Arduino Development



✅ Compile Arduino code in the browser

✅ Flash to Arduino boards (Uno, Nano, Nano 33 BLE)

✅ Real-time serial monitor with live data streaming

✅ Syntax-highlighted code editor

✅ Detailed build output and error messages



TensorFlow Model Conversion



✅ Convert TensorFlow.js models to TensorFlow Lite (.tflite)

✅ Direct folder path - no file uploads needed

✅ Automatic model validation

✅ Cross-platform path support (Windows/Mac/Linux)

✅ Automatic quantization (float16)

✅ Download converted models





🖥️ System Requirements



Operating System: Windows 10/11, macOS 10.14+, or Linux (Ubuntu 18.04+)

Chrome Browser: Version 88 or higher

Node.js: Version 14.0.0 or higher

Python: Version 3.7 - 3.11 (TensorFlow compatibility)

Disk Space: ~2GB for all dependencies

RAM: 4GB minimum, 8GB recommended





📦 Installation Guide

1\. Install PlatformIO Core

PlatformIO Core is the command-line tool for compiling and uploading Arduino code.

Option A: Install via pip (Recommended)

bash# Install PlatformIO Core

pip install platformio



\# Verify installation

pio --version

\# Should show: PlatformIO Core, version 6.x.x

Option B: Install via installer script

Windows:

powershell# Run PowerShell as Administrator

python -m pip install --upgrade pip

pip install platformio

macOS/Linux:

bash# Install via curl

curl -fsSL https://raw.githubusercontent.com/platformio/platformio-core-installer/master/get-platformio.py -o get-platformio.py

python3 get-platformio.py



\# Add to PATH (add to ~/.bashrc or ~/.zshrc)

export PATH=$PATH:~/.platformio/penv/bin

Verify PlatformIO Installation

bashpio --version

pio boards         # List available boards

pio system info    # Show system information

Common PlatformIO Issues

Issue: pio: command not found

bash# Windows: Add to PATH

\# C:\\Users\\YourName\\.platformio\\penv\\Scripts



\# macOS/Linux: Add to PATH

export PATH=$PATH:~/.platformio/penv/bin



2\. Install Python \& TensorFlow

TensorFlow and TensorFlow.js converter are required for model conversion.

Step 2.1: Install Python

Windows:



Download Python from python.org

Important: Check "Add Python to PATH" during installation

Install Python 3.7 - 3.11 (TensorFlow compatibility)



macOS:

bash# Using Homebrew

brew install python@3.10



\# Verify

python3 --version

Linux (Ubuntu/Debian):

bashsudo apt update

sudo apt install python3 python3-pip python3-venv

python3 --version

Step 2.2: Create Virtual Environment (Recommended)

bash# Create virtual environment

python -m venv tf-env



\# Activate it

\# Windows:

tf-env\\Scripts\\activate



\# macOS/Linux:

source tf-env/bin/activate

Step 2.3: Install TensorFlow \& TensorFlow.js

bash# Upgrade pip first

pip install --upgrade pip



\# Install TensorFlow (this may take several minutes)

pip install tensorflow



\# Install TensorFlow.js converter

pip install tensorflowjs



\# Verify installations

python -c "import tensorflow as tf; print('TensorFlow version:', tf.\_\_version\_\_)"

python -c "import tensorflowjs; print('TensorFlow.js converter installed')"

Expected Output:

TensorFlow version: 2.x.x

TensorFlow.js converter installed

TensorFlow Installation Issues

Issue: TensorFlow won't install

bash# Try specific version

pip install tensorflow==2.13.0



\# Or use CPU-only version (smaller, faster install)

pip install tensorflow-cpu

Issue: Import errors

bash# Reinstall with no cache

pip install --no-cache-dir tensorflow tensorflowjs



3\. Install Node.js Dependencies

Step 3.1: Install Node.js

Windows:



Download from nodejs.org

Install LTS version (recommended)

Verify: node --version and npm --version



macOS:

bash# Using Homebrew

brew install node



\# Verify

node --version

npm --version

Linux (Ubuntu/Debian):

bash# Using NodeSource repository

curl -fsSL https://deb.nodesource.com/setup\_lts.x | sudo -E bash -

sudo apt-get install -y nodejs



\# Verify

node --version

npm --version



4\. Set Up Bridge Server

Step 4.1: Create Project Directory

bash# Create and enter directory

mkdir my-pio-bridge

cd my-pio-bridge

Step 4.2: Initialize npm Project

bash# Initialize package.json

npm init -y

Step 4.3: Install Dependencies

bash# Install Express and SerialPort

npm install express serialport



\# Optional: Install nodemon for development

npm install --save-dev nodemon

Step 4.4: Add Server Files

Create my-bridge-server.js in the my-pio-bridge directory with the provided server code.

Also create package.json:

json{

&nbsp; "name": "my-pio-bridge",

&nbsp; "version": "2.0.0",

&nbsp; "description": "Bridge server for Arduino and TFLite conversion",

&nbsp; "main": "my-bridge-server.js",

&nbsp; "scripts": {

&nbsp;   "start": "node my-bridge-server.js",

&nbsp;   "dev": "nodemon my-bridge-server.js"

&nbsp; },

&nbsp; "dependencies": {

&nbsp;   "express": "^4.18.2",

&nbsp;   "serialport": "^12.0.0"

&nbsp; },

&nbsp; "devDependencies": {

&nbsp;   "nodemon": "^3.0.1"

&nbsp; }

}

Step 4.5: Test the Server

bash# Start the server

node my-bridge-server.js



\# You should see:

\# ✨ PlatformIO Bridge Server is RUNNING

\# Server URL: http://localhost:8080

Verify the server is working:

Open a browser and go to http://localhost:8080 - you should see the server status page.



5\. Install Chrome Extension

Step 5.1: Prepare Extension Files

Create your extension directory structure:

your-extension/

├── manifest.json

├── mySidePanel.html

├── mySidePanel.js

├── myServiceWorker.js

└── icons/

&nbsp;   ├── icon16.png

&nbsp;   ├── icon32.png

&nbsp;   ├── icon48.png

&nbsp;   └── icon128.png

Copy all the provided files into this directory.

Step 5.2: Load Extension in Chrome



Open Chrome and navigate to: chrome://extensions

Enable Developer mode (toggle in top-right corner)

Click Load unpacked

Select your extension folder

The extension icon should appear in your Chrome toolbar



Step 5.3: Verify Installation



Click the extension icon

Side panel should open with two tabs: "Arduino Code" and "TFLite Converter"

Check the browser console (F12) for any errors





🚀 Usage

Arduino Code Development

1\. Start the Bridge Server

bashcd my-pio-bridge

node my-bridge-server.js

Keep this terminal window open while using the extension.

2\. Connect Arduino Board



Connect your Arduino via USB

Make sure drivers are installed (check Device Manager on Windows)



3\. Use the Extension



Click the extension icon to open the side panel

Select the Arduino Code tab

Choose your board from the dropdown (Uno, Nano, or Nano 33 BLE)

Write or paste your Arduino code:



cppvoid setup() {

&nbsp; Serial.begin(9600);

&nbsp; pinMode(LED\_BUILTIN, OUTPUT);

}



void loop() {

&nbsp; digitalWrite(LED\_BUILTIN, HIGH);

&nbsp; delay(1000);

&nbsp; digitalWrite(LED\_BUILTIN, LOW);

&nbsp; delay(1000);

&nbsp; Serial.println("Blink!");

}



Click Compile \& Flash

Monitor progress in the Status Log

View serial output in the Serial Console



Serial Monitor



Serial data appears in real-time in the Serial Console

Click Clear Serial to clear the console

Serial monitor automatically reconnects after uploads





TensorFlow.js to TFLite Conversion

1\. Prepare Your Model

Ensure you have a TensorFlow.js model folder containing:



model.json (model architecture)

Weight files (e.g., group1-shard1of1.bin)



Example folder structure:

my\_model/

├── model.json

├── group1-shard1of3.bin

├── group1-shard2of3.bin

└── group1-shard3of3.bin

2\. Get the Folder Path

Windows:



Right-click folder → Properties → Copy the "Location" path

Example: C:\\Users\\YourName\\Documents\\my\_model



macOS:



Right-click folder → Get Info → Copy path after "Where:"

Or drag folder to Terminal to get full path

Example: /Users/yourname/Documents/my\_model



Linux:



Right-click folder → Properties → Copy "Location"

Or use pwd command in Terminal

Example: /home/yourname/models/my\_model



3\. Use the Extension



Ensure bridge server is running

Open extension and go to TFLite Converter tab

Enter a Model Name (e.g., my\_model)

Paste the Model Folder Path:



&nbsp;  Windows: C:\\Users\\YourName\\Documents\\my\_model

&nbsp;  macOS:   /Users/yourname/Documents/my\_model

&nbsp;  Linux:   /home/yourname/models/my\_model



Click Validate Path



Extension verifies model.json exists

Lists all weight files found

Enables the Convert button if valid





Click Convert to TFLite



Conversion happens on the server

Progress shown in Conversion Output





Click Download .tflite when complete



4\. Use the TFLite Model

The downloaded .tflite file can now be:



Deployed to embedded devices (ESP32, Arduino, etc.)

Used with TensorFlow Lite runtime

Loaded in mobile apps (Android/iOS)





🐛 Troubleshooting

Bridge Server Issues

Server won't start

Problem:

Error: Cannot find module 'express'

Solution:

bashcd my-pio-bridge

npm install express serialport



Problem:

Error: listen EADDRINUSE: address already in use :::8080

Solution:

bash# Kill process using port 8080

\# Windows:

netstat -ano | findstr :8080

taskkill /PID <PID> /F



\# macOS/Linux:

lsof -ti:8080 | xargs kill -9



\# Or change the port in my-bridge-server.js:

const myPort = 8081; // Change to different port



Arduino Issues

Cannot find Arduino board

Problem:

Serial port not detected

Solution:



Verify Arduino is connected via USB

Install USB drivers:



Windows: Download from arduino.cc or manufacturer

macOS: Usually automatic

Linux: May need to add user to dialout group







bash     sudo usermod -a -G dialout $USER

&nbsp;    # Log out and back in



Check Device Manager (Windows) or ls /dev/tty\* (macOS/Linux)

Try a different USB cable or port





Compilation fails

Problem:

PlatformIO execution FAILED

Solutions:



Verify PlatformIO is installed:



bash   pio --version



Check PlatformIO is in PATH

Review error details in Status Log

Ensure correct board is selected

Verify code syntax is correct

Try compiling manually:



bash   cd myPioProject

&nbsp;  pio run



Serial monitor not working

Problem:

Serial stream disconnected

Solutions:



Close other serial monitors (Arduino IDE, PuTTY, etc.)

Disconnect and reconnect Arduino

Restart the bridge server

Check baud rate matches (default: 9600)





TFLite Conversion Issues

Path validation fails

Problem:

ERROR: Folder does not exist

Solutions:



Check path is correct (copy-paste from file browser)

Use forward slashes or double backslashes on Windows:



✅ C:/Users/Name/model or C:\\\\Users\\\\Name\\\\model

❌ C:\\Users\\Name\\model (may fail)





Verify folder contains model.json

Check folder permissions





Conversion fails

Problem:

Python conversion FAILED

Solutions:



Verify TensorFlow installation:



bash   python -c "import tensorflow; print(tensorflow.\_\_version\_\_)"

&nbsp;  python -c "import tensorflowjs; print('OK')"



Verify Python path:



bash   which python  # macOS/Linux

&nbsp;  where python  # Windows



Check if virtual environment is activated:



bash   # If you created a virtual environment, activate it:

&nbsp;  # Windows:

&nbsp;  tf-env\\Scripts\\activate

&nbsp;  

&nbsp;  # macOS/Linux:

&nbsp;  source tf-env/bin/activate



Check model.json format:



Ensure it's valid JSON

Verify weightsManifest exists

Check weight files are present





Review detailed error in Conversion Output log





Model loading errors

Problem:

ERROR: Failed to load model

Solutions:



Verify model was exported correctly from TensorFlow.js

Check all weight files exist

Ensure weight file names match those in model.json

Try re-exporting the model:



javascript   // In your TensorFlow.js code

&nbsp;  await model.save('file://./my\_model');



Extension Issues

Extension not loading

Solution:



Go to chrome://extensions

Click the Reload button on your extension

Check for errors in the extension details

Click "service worker" to view service worker logs





Side panel won't open

Solution:



Click the extension icon in the toolbar

Check service worker logs at chrome://extensions

Reload the extension

Restart Chrome





Connection errors

Problem:

CONNECTION ERROR: Cannot reach bridge server

Solution:



Verify bridge server is running at http://localhost:8080

Check the server terminal for errors

Open http://localhost:8080 in browser to verify server is responding

Check manifest.json has correct host permissions





📁 File Structure

Project Structure:



my-pio-bridge/                   # Bridge Server

├── my-bridge-server.js          # Main server file

├── package.json                 # Node.js dependencies

├── myPioProject/                # Auto-generated PlatformIO projects

│   ├── platformio.ini           # PlatformIO configuration

│   └── src/

│       └── main.cpp             # Compiled Arduino code

└── myTFLiteModels/              # TFLite conversion outputs

&nbsp;   └── \[model\_name\_timestamp]/

&nbsp;       ├── convert.py           # Python conversion script

&nbsp;       └── model.tflite         # Output TFLite file



your-extension/                  # Chrome Extension

├── manifest.json                # Extension configuration

├── mySidePanel.html             # UI with tabs

├── mySidePanel.js               # Main logic

├── myServiceWorker.js           # Background service

└── icons/                       # Extension icons

&nbsp;   ├── icon16.png

&nbsp;   ├── icon32.png

&nbsp;   ├── icon48.png

&nbsp;   └── icon128.png



🔌 API Endpoints

The bridge server exposes the following endpoints:

Arduino Endpoints

POST /compile-flash

Compile and upload Arduino code to a board.

Request:

json{

&nbsp; "code": "void setup() { ... }",

&nbsp; "board": "uno"

}

Response (Success):

json{

&nbsp; "message": "Compilation and Upload for uno succeeded!",

&nbsp; "output": "...",

&nbsp; "serialMonitor": "started"

}



GET /serial-stream

Server-Sent Events stream for real-time serial data.

Response Stream:

data: {"type":"serial","message":"Hello from Arduino!"}

data: {"type":"serial","message":"Sensor value: 42"}



TFLite Endpoints

POST /validate-model-path

Validate that a folder contains a valid TensorFlow.js model.

Request:

json{

&nbsp; "folderPath": "/path/to/model/folder"

}

Response (Success):

json{

&nbsp; "message": "Model folder validation successful",

&nbsp; "normalizedPath": "/normalized/path/to/model",

&nbsp; "weightFiles": \[

&nbsp;   "group1-shard1of3.bin",

&nbsp;   "group1-shard2of3.bin",

&nbsp;   "group1-shard3of3.bin"

&nbsp; ]

}

Response (Error):

json{

&nbsp; "message": "Model folder validation failed",

&nbsp; "error": "model.json not found in folder"

}



POST /convert-tfjs-to-tflite

Convert TensorFlow.js model to TFLite format.

Request:

json{

&nbsp; "folderPath": "/path/to/model/folder",

&nbsp; "modelName": "my\_model"

}

Response (Success):

json{

&nbsp; "message": "TFLite conversion successful!",

&nbsp; "tfliteData": "base64\_encoded\_tflite\_file...",

&nbsp; "fileName": "my\_model.tflite",

&nbsp; "sizeKB": "125.45",

&nbsp; "output": "Model loaded: (1, 224, 224, 3) -> (1, 1000)\\nSUCCESS: Model saved (125.45 KB)"

}

Response (Error):

json{

&nbsp; "message": "TFLite conversion failed",

&nbsp; "error": "ERROR: Invalid model format"

}



Utility Endpoints

GET /health

Health check endpoint.

Response:

json{

&nbsp; "status": "running",

&nbsp; "timestamp": "2024-01-01T12:00:00.000Z",

&nbsp; "projectDir": "/path/to/myPioProject",

&nbsp; "tfliteDir": "/path/to/myTFLiteModels",

&nbsp; "serialMonitor": "active",

&nbsp; "serialClients": 1

}



GET /

Server status page (HTML).

Displays:



Server status

Available endpoints

Directory paths

Serial monitor status

Connected clients





🎯 Tips \& Best Practices

Arduino Development



Save your code externally - The editor doesn't auto-save

Use Serial.begin(9600) - Matches the default baud rate

Check Serial Console - Always monitor for runtime errors

Clear logs regularly - Keeps the interface clean

Test small changes - Compile frequently to catch errors early



TFLite Conversion



Use absolute paths - Full paths are more reliable than relative

Validate first - Always click "Validate Path" before converting

Check model size - Large models take longer to convert

Keep originals - Don't delete your TF.js model after conversion

Test on target device - Verify the .tflite works on your hardware

Quantization is automatic - Models are optimized with float16



Server Management



Keep server running - Leave the terminal window open

Restart if issues occur - Most problems are solved by restarting

Check logs - Server terminal shows detailed debugging info

Use virtual environment - Isolates Python dependencies

One server instance - Don't run multiple servers on the same port





🔄 Quick Start Commands

bash# Start everything in the right order:



\# 1. Activate Python virtual environment (if using one)

source tf-env/bin/activate  # macOS/Linux

tf-env\\Scripts\\activate     # Windows



\# 2. Start bridge server

cd my-pio-bridge

node my-bridge-server.js



\# 3. Open Chrome and click extension icon



\# 4. When done, stop server

\# Press Ctrl+C in terminal



📝 License

ISC



🤝 Contributing

Contributions welcome! Feel free to submit issues and pull requests.



📧 Support

If you encounter issues:



Check the Troubleshooting section

Review server logs in the terminal

Check browser console (F12) for extension errors

Verify all requirements are installed

Try the Quick Start commands to ensure proper setup





🌟 Features Coming Soon



&nbsp;Multiple board profiles

&nbsp;Code snippets library

&nbsp;Model comparison tools

&nbsp;Batch conversion support

&nbsp;Custom quantization options





Enjoy building with Arduino and TensorFlow Lite! 🚀


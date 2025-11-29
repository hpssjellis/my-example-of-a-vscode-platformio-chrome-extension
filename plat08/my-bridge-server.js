/*
===============================================================================
INSTALLATION INSTRUCTIONS
===============================================================================

1. CREATE PROJECT DIRECTORY:
   mkdir my-pio-bridge
   cd my-pio-bridge

2. INITIALIZE NPM:
   npm init -y

3. INSTALL DEPENDENCIES:
   npm install express serialport

4. INSTALL PYTHON DEPENDENCIES (for TFLite conversion):
   pip install tensorflow tensorflowjs

5. CREATE THIS FILE:
   Save as: my-bridge-server.js

6. RUN THE SERVER:
   node my-bridge-server.js

7. REQUIREMENTS:
   - Node.js (v14 or higher)
   - Python 3.7+ with tensorflow and tensorflowjs
   - PlatformIO Core CLI installed and in PATH
   - Arduino board connected via USB

===============================================================================
*/

const myExpress = require('express');
const { exec: myExec } = require('child_process');
const myFs = require('fs');
const myPath = require('path');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

// Use my descriptive, camelCase variable names
const myApp = myExpress();
const myPort = 8080;
const myProjectDir = myPath.join(__dirname, 'myPioProject');
const mySourceFile = myPath.join(myProjectDir, 'src', 'main.cpp');
const myTFLiteDir = myPath.join(__dirname, 'myTFLiteModels');

// Serial port tracking
let myActiveSerialPort = null;
let mySerialClients = [];

// --- Enhanced Logging Helper ---
function myLog(myMessage, myLevel = 'INFO') {
    const myTimestamp = new Date().toISOString();
    const myPrefix = `[${myTimestamp}] [${myLevel}]`;
    console.log(`${myPrefix} ${myMessage}`);
}

// --- Configuration and Setup ---
myLog('Starting PlatformIO Bridge Server...', 'INFO');

// Create TFLite directory if it doesn't exist
if (!myFs.existsSync(myTFLiteDir)) {
    myFs.mkdirSync(myTFLiteDir, { recursive: true });
    myLog(`Created TFLite models directory: ${myTFLiteDir}`, 'INFO');
}

// Use built-in Express middleware
// 💡 IMPORTANT: Increased limit to 100MB for large model files
myApp.use(myExpress.json({ limit: '100mb' })); 
myLog('JSON body parser middleware enabled with 100MB limit', 'INFO');

// Set up CORS (UNCHANGED)
myApp.use((myReq, myRes, myNext) => {
    myRes.setHeader('Access-Control-Allow-Origin', '*'); 
    myRes.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    myRes.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    myLog(`${myReq.method} ${myReq.url} from ${myReq.ip}`, 'REQUEST');
    
    myNext();
});

// Handle OPTIONS preflight (UNCHANGED)
myApp.options('*', (myReq, myRes) => {
    myLog('Received OPTIONS preflight request', 'INFO');
    myRes.sendStatus(200);
});

// --- Arduino/PlatformIO Helper Functions (UNCHANGED) ---

function myGetPioConfig(myBoardId) {
// ... (content remains the same) ...
    myLog(`Looking up PlatformIO config for board: ${myBoardId}`, 'INFO');
    
    let myConfig;
    switch (myBoardId) {
        case 'nano33ble':
            myConfig = { platform: 'nordicnrf52', board: 'nano33ble', baudRate: 9600 };
            break;
        case 'uno':
            myConfig = { platform: 'atmelavr', board: 'uno', baudRate: 9600 };
            break;
        case 'nano':
            myConfig = { platform: 'atmelavr', board: 'nanoatmega328', baudRate: 9600 };
            break;
        default:
            myLog(`Unknown board '${myBoardId}', defaulting to Arduino Uno`, 'WARN');
            myConfig = { platform: 'atmelavr', board: 'uno', baudRate: 9600 };
    }
    
    myLog(`Config resolved: platform=${myConfig.platform}, board=${myConfig.board}`, 'INFO');
    return myConfig;
}

function myInitPioProject(myBoardId) {
// ... (content remains the same) ...
    myLog('Initializing PlatformIO project...', 'INFO');
    
    const myConfig = myGetPioConfig(myBoardId);
    
    const mySrcDir = myPath.join(myProjectDir, 'src');
    myLog(`Creating project directory: ${myProjectDir}`, 'INFO');
    myFs.mkdirSync(mySrcDir, { recursive: true });
    myLog(`Source directory ready: ${mySrcDir}`, 'INFO');
    
    const myIniContent = 
`[env:${myConfig.board}]
platform = ${myConfig.platform}
board = ${myConfig.board}
framework = arduino
monitor_speed = ${myConfig.baudRate}
`;
    const myIniPath = myPath.join(myProjectDir, 'platformio.ini');
    myFs.writeFileSync(myIniPath, myIniContent);
    myLog(`platformio.ini written to: ${myIniPath}`, 'INFO');
    
    return myConfig;
}

async function myDetectSerialPort() {
// ... (content remains the same) ...
    myLog('Detecting Arduino serial port...', 'INFO');
    
    try {
        const ports = await SerialPort.list();
        myLog(`Found ${ports.length} serial ports`, 'INFO');
        
        const myArduinoPort = ports.find(port => 
            port.manufacturer && (
                port.manufacturer.includes('Arduino') ||
                port.manufacturer.includes('FTDI') ||
                port.manufacturer.includes('Silicon Labs') ||
                port.manufacturer.includes('Prolific') ||
                port.manufacturer.includes('CH340')
            )
        );
        
        if (myArduinoPort) {
            myLog(`Arduino detected on port: ${myArduinoPort.path}`, 'SUCCESS');
            return myArduinoPort.path;
        }
        
        if (ports.length > 0) {
            myLog(`No Arduino detected, using first port: ${ports[0].path}`, 'WARN');
            return ports[0].path;
        }
        
        myLog('No serial ports found', 'ERROR');
        return null;
    } catch (error) {
        myLog(`Error detecting serial port: ${error.message}`, 'ERROR');
        return null;
    }
}

async function myStartSerialMonitor(myBaudRate = 9600) {
// ... (content remains the same) ...
    if (myActiveSerialPort && myActiveSerialPort.isOpen) {
        myLog('Closing existing serial connection...', 'INFO');
        myActiveSerialPort.close();
        myActiveSerialPort = null;
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const myPortPath = await myDetectSerialPort();
    if (!myPortPath) {
        myLog('Cannot start serial monitor: no port detected', 'ERROR');
        return false;
    }
    
    try {
        myActiveSerialPort = new SerialPort({
            path: myPortPath,
            baudRate: myBaudRate,
            autoOpen: false
        });
        
        const myParser = myActiveSerialPort.pipe(new ReadlineParser({ delimiter: '\n' }));
        
        myActiveSerialPort.open((err) => {
            if (err) {
                myLog(`Failed to open serial port: ${err.message}`, 'ERROR');
                return;
            }
            
            myLog(`Serial monitor started on ${myPortPath} at ${myBaudRate} baud`, 'SUCCESS');
            
            myParser.on('data', (myLine) => {
                const myMessage = myLine.toString().trim();
                if (myMessage) {
                    myLog(`[SERIAL] ${myMessage}`, 'INFO');
                    
                    mySerialClients.forEach(client => {
                        client.write(`data: ${JSON.stringify({ type: 'serial', message: myMessage })}\n\n`);
                    });
                }
            });
            
            myActiveSerialPort.on('error', (err) => {
                myLog(`Serial port error: ${err.message}`, 'ERROR');
            });
            
            myActiveSerialPort.on('close', () => {
                myLog('Serial port closed', 'INFO');
            });
        });
        
        return true;
    } catch (error) {
        myLog(`Error starting serial monitor: ${error.message}`, 'ERROR');
        return false;
    }
}

// --- TFLite Conversion Helper Functions (REMOVED/REPLACED by the main route logic) ---

// --- Route Handlers ---

// Arduino: Compile and Flash (UNCHANGED)
myApp.post('/compile-flash', async (myReq, myRes) => {
// ... (content remains the same) ...
    myLog('=== NEW COMPILE & FLASH REQUEST ===', 'INFO');
    
    const { code: myCode, board: myBoardName = 'uno' } = myReq.body; 
    
    myLog(`Received request for board: ${myBoardName}`, 'INFO');
    myLog(`Code length: ${myCode ? myCode.length : 0} characters`, 'INFO');
    
    if (!myCode) {
        myLog('Request rejected: No code provided', 'ERROR');
        return myRes.status(400).json({ 
            message: 'Missing Arduino code.', 
            error: 'Code field is empty.' 
        });
    }

    try {
        myLog('Step 1: Initializing project structure', 'INFO');
        const myConfig = myInitPioProject(myBoardName);

        myLog('Step 2: Writing code to source file', 'INFO');
        myFs.writeFileSync(mySourceFile, myCode, 'utf8');
        myLog(`Code successfully written to: ${mySourceFile}`, 'INFO');
        
        myLog('Step 3: Executing PlatformIO compilation and upload', 'INFO');
        const myCommand = `pio run -d "${myProjectDir}" --target upload`;
        myLog(`Running command: ${myCommand}`, 'INFO');
        
        const myStartTime = Date.now();
        const { myStdout, myStderr } = await new Promise((resolve, reject) => {
            myExec(myCommand, { maxBuffer: 1024 * 500 }, (myError, myStdout, myStderr) => {
                const myDuration = ((Date.now() - myStartTime) / 1000).toFixed(2);
                
                if (myError) {
                    myLog(`PlatformIO execution FAILED after ${myDuration}s`, 'ERROR');
                    if (myStdout) myLog('=== STDOUT ===\n' + myStdout, 'ERROR');
                    if (myStderr) myLog('=== STDERR ===\n' + myStderr, 'ERROR');
                    return reject({ stdout: myStdout, stderr: myStderr });
                }
                
                myLog(`PlatformIO execution completed successfully in ${myDuration}s`, 'SUCCESS');
                resolve({ myStdout, myStderr });
            });
        });

        myLog('Step 4: Starting serial monitor...', 'INFO');
        const mySerialStarted = await myStartSerialMonitor(myConfig.baudRate);
        
        myLog('=== REQUEST COMPLETED SUCCESSFULLY ===', 'SUCCESS');
        
        myRes.status(200).json({ 
            message: `Compilation and Upload for ${myBoardName} succeeded!`,
            output: myStdout.trim(),
            serialMonitor: mySerialStarted ? 'started' : 'failed'
        });

    } catch (myException) {
        myLog('=== REQUEST FAILED ===', 'ERROR');
        const myErrorOutput = myException.stderr || myException.stdout || myException.toString();
        
        myRes.status(500).json({ 
            message: 'Compilation or Upload failed.', 
            error: myErrorOutput.trim()
        });
    }
});

// TFLite: Convert TF.js to TFLite (UPDATED FOR MULTI-FILE SHARDS)
myApp.post('/convert-tfjs-to-tflite', async (myRequest, myResponse) => {
    myLog('=== NEW TFLITE CONVERSION REQUEST (Multi-file support) ===', 'INFO');
    
    // Expects myFilesData as an array of { fileName, fileContent } objects
    const { myModelName, myFilesData } = myRequest.body; 

    if (!myFilesData || myFilesData.length === 0) {
        myLog('ERROR: No files data received for TFLite conversion.', 'ERROR');
        return myResponse.status(400).json({ mySuccess: false, myMessage: 'No files data provided.' });
    }
    
    let myModelJsonFile = null;
    let myTotalSize = 0;
    // Create a unique temporary directory for this conversion
    const myModelDir = myPath.join(myTFLiteDir, `tfjs_model_${Date.now()}`); 
    const myTFLiteOutputPath = myPath.join(myTFLiteDir, `${myModelName}.tflite`);
    
    // We will write the python script to the temp directory for simplicity
    const myPythonFileName = `my_tflite_convert.py`; 
    const myPythonScriptPath = myPath.join(myModelDir, myPythonFileName);
    
    try {
        // 1. Create temporary directory to hold all files (JSON + Shards)
        myFs.mkdirSync(myModelDir, { recursive: true });
        myLog(`Created temporary model directory: ${myModelDir}`, 'INFO');
        
        // 2. Save all files (JSON + Shards) to the temporary directory
        for (const myFile of myFilesData) {
            const myFilePath = myPath.join(myModelDir, myFile.fileName);
            // Decode Base64 content from the client and write the binary file
            const myFileBuffer = Buffer.from(myFile.fileContent, 'base64');
            myFs.writeFileSync(myFilePath, myFileBuffer);
            myLog(`Saved file: ${myFile.fileName} (${myFileBuffer.length} bytes)`, 'INFO');
            myTotalSize += myFileBuffer.length;
            
            // Track the model.json file's path
            if (myFile.fileName.toLowerCase() === 'model.json') {
                myModelJsonFile = myFilePath;
            }
        }
        
        myLog(`Total files size received: ${(myTotalSize / 1024).toFixed(2)} KB`, 'INFO');
        
        if (!myModelJsonFile) {
            throw new Error("Could not find 'model.json' in uploaded files.");
        }

        // 3. Generate Python script content
        const myPythonScriptContent = `
import tensorflow as tf
import sys
import os

# Script receives model.json path and output path as arguments
# We use Python's built-in path handling for safety
my_model_json_path = os.path.abspath(sys.argv[1])
my_tflite_output_path = os.path.abspath(sys.argv[2])

print(f"Loading model from: {my_model_json_path}")
print(f"Outputting TFLite to: {my_tflite_output_path}")

try:
    # tf.lite.TFLiteConverter.from_tfjs_model automatically looks for weights 
    # (.bin) files in the directory containing my_model_json_path.
    my_converter = tf.lite.TFLiteConverter.from_tfjs_model(my_model_json_path)

    # Use your preferred optimization: float16 quantization
    my_converter.optimizations = [tf.lite.Optimize.DEFAULT]
    my_converter.target_spec.supported_types = [tf.float16]

    my_tflite_model = my_converter.convert()

    with open(my_tflite_output_path, 'wb') as my_f:
        my_f.write(my_tflite_model)

    my_size_kb = len(my_tflite_model) / 1024
    print(f"SUCCESS: Model converted and saved. Size: {my_size_kb:.2f} KB")

except Exception as my_e:
    print(f"ERROR: TFLite conversion failed: {my_e}", file=sys.stderr)
    sys.exit(1)
`;

        // 4. Save and execute the Python script
        myFs.writeFileSync(myPythonScriptPath, myPythonScriptContent);
        
        // Use the absolute path of the model.json file and the final output path
        const myConversionCommand = `python "${myPythonScriptPath}" "${myModelJsonFile}" "${myTFLiteOutputPath}"`;
        myLog(`Executing conversion command: ${myConversionCommand}`, 'INFO');
        
        const { myStdout, myStderr } = await new Promise((resolve, reject) => {
            myExec(myConversionCommand, { maxBuffer: 1024 * 500 }, (myError, myStdout, myStderr) => {
                if (myError) {
                    // Check if the error is just a warning in stderr but still executed
                    if (myError.code !== 1) { // Standard error exit code is usually 1
                        myLog(`Python conversion FAILED. STDOUT: ${myStdout} STDERR: ${myStderr}`, 'ERROR');
                        return reject({ myStdout, myStderr });
                    }
                } 
                
                if (myStderr.includes('ERROR:')) {
                    myLog(`Python conversion FAILED (Detected 'ERROR:' in STDERR)`, 'ERROR');
                    return reject({ myStdout, myStderr });
                }

                if (myStderr.trim().length > 0) {
                    myLog(`Python output to STDERR (Potential Warnings):\n${myStderr}`, 'WARN');
                }
                
                resolve({ myStdout, myStderr });
            });
        });
        
        myLog(`Conversion STDOUT:\n${myStdout.toString()}`, 'INFO');
        
        // 5. Read converted TFLite file and send back to client
        if (!myFs.existsSync(myTFLiteOutputPath)) {
             throw new Error("TFLite file was not created by the Python script.");
        }
        
        const myTFLiteBuffer = myFs.readFileSync(myTFLiteOutputPath);
        // Base64 encode the final TFLite file for transmission
        const myTFLiteBase64 = myTFLiteBuffer.toString('base64');
        const myTFLiteSizeKB = (myTFLiteBuffer.length / 1024).toFixed(2);
        
        myLog(`TFLite size: ${myTFLiteSizeKB} KB`, 'SUCCESS');
        myLog('Conversion successful. Sending TFLite file back to client.', 'SUCCESS');

        myResponse.json({
            mySuccess: true,
            myMessage: 'TFLite conversion successful.',
            myConversionOutput: myStdout.toString().trim(),
            myConvertedTFLite: {
                fileName: `${myModelName}.tflite`,
                fileContent: myTFLiteBase64,
                sizeKB: myTFLiteSizeKB
            }
        });

    } catch (myError) {
        myLog(`TFLite Conversion Failed: ${myError.message || myError.toString()}`, 'ERROR');
        
        const myErrorMessage = myError.myStderr || myError.stderr || myError.message || myError.toString();
        
        myResponse.status(500).json({ 
            mySuccess: false, 
            myMessage: 'TFLite conversion failed on the server.',
            myError: myErrorMessage
        });
    } finally {
        // 6. Clean up temporary files and directories
        if (myFs.existsSync(myModelDir)) {
             // Use fs.rmSync (recursive: true) for safe directory removal
             myFs.rmSync(myModelDir, { recursive: true, force: true });
             myLog(`Cleaned up temporary model directory: ${myModelDir}`, 'INFO');
        }
        // The output file is left in myTFLiteDir for possible manual retrieval, 
        // as we only clean up the temporary directory.
    }
});

// Serial Stream (SSE) (UNCHANGED)
myApp.get('/serial-stream', (myReq, myRes) => {
// ... (content remains the same) ...
    myLog('New serial stream client connected', 'INFO');
    
    myRes.setHeader('Content-Type', 'text/event-stream');
    myRes.setHeader('Cache-Control', 'no-cache');
    myRes.setHeader('Connection', 'keep-alive');
    myRes.setHeader('Access-Control-Allow-Origin', '*');
    
    mySerialClients.push(myRes);
    myLog(`Total serial clients: ${mySerialClients.length}`, 'INFO');
    
    myRes.write(`data: ${JSON.stringify({ type: 'connected', message: 'Serial stream connected' })}\n\n`);
    
    myReq.on('close', () => {
        myLog('Serial stream client disconnected', 'INFO');
        mySerialClients = mySerialClients.filter(client => client !== myRes);
        myLog(`Total serial clients: ${mySerialClients.length}`, 'INFO');
    });
});

// Health Check (UNCHANGED)
myApp.get('/health', (myReq, myRes) => {
// ... (content remains the same) ...
    myLog('Health check request received', 'INFO');
    myRes.json({ 
        status: 'running',
        timestamp: new Date().toISOString(),
        projectDir: myProjectDir,
        tfliteDir: myTFLiteDir,
        serialMonitor: myActiveSerialPort && myActiveSerialPort.isOpen ? 'active' : 'inactive',
        serialClients: mySerialClients.length
    });
});

// Root (UNCHANGED)
myApp.get('/', (myReq, myRes) => {
// ... (content remains the same) ...
    myLog('Root endpoint accessed', 'INFO');
    myRes.send(`
        <h1>PlatformIO Bridge Server</h1>
        <p>Status: <strong style="color: green;">Running</strong></p>
        <h2>Endpoints:</h2>
        <ul>
            <li><strong>POST /compile-flash</strong> - Compile and upload Arduino code</li>
            <li><strong>POST /convert-tfjs-to-tflite</strong> - Convert TensorFlow.js model to TFLite</li>
            <li><strong>GET /serial-stream</strong> - Serial data stream (SSE)</li>
            <li><strong>GET /health</strong> - Health check</li>
        </ul>
        <h2>Status:</h2>
        <p>Arduino Project: <code>${myProjectDir}</code></p>
        <p>TFLite Models: <code>${myTFLiteDir}</code></p>
        <p>Serial Monitor: <strong>${myActiveSerialPort && myActiveSerialPort.isOpen ? 'Active' : 'Inactive'}</strong></p>
        <p>Connected Clients: <strong>${mySerialClients.length}</strong></p>
    `);
});

// Start Server (UNCHANGED)
myApp.listen(myPort, () => {
// ... (content remains the same) ...
    myLog('='.repeat(60), 'INFO');
    myLog('✨ PlatformIO Bridge Server is RUNNING', 'SUCCESS');
    myLog(`Server URL: http://localhost:${myPort}`, 'SUCCESS');
    myLog(`Arduino Project: ${myProjectDir}`, 'INFO');
    myLog(`TFLite Models: ${myTFLiteDir}`, 'INFO');
    myLog('='.repeat(60), 'INFO');
    myLog('REQUIREMENTS:', 'WARN');
    myLog('  - PlatformIO Core (CLI) installed', 'WARN');
    myLog('  - Python 3 with tensorflow & tensorflowjs', 'WARN');
    myLog('  - npm install express serialport', 'WARN');
    myLog('To test: Open http://localhost:8080', 'INFO');
    myLog('Press Ctrl+C to stop', 'INFO');
});
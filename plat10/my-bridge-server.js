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
myApp.use(myExpress.json({ limit: '100mb' })); // Increased limit for model files
myLog('JSON body parser middleware enabled with 100MB limit', 'INFO');

// Set up CORS
myApp.use((myReq, myRes, myNext) => {
    myRes.setHeader('Access-Control-Allow-Origin', '*'); 
    myRes.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    myRes.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    myLog(`${myReq.method} ${myReq.url} from ${myReq.ip}`, 'REQUEST');
    
    myNext();
});

// Handle OPTIONS preflight
myApp.options('*', (myReq, myRes) => {
    myLog('Received OPTIONS preflight request', 'INFO');
    myRes.sendStatus(200);
});

// --- Arduino/PlatformIO Helper Functions ---

function myGetPioConfig(myBoardId) {
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

// --- TFLite Conversion Helper Functions ---

async function myValidateModelFolder(myFolderPath) {
    myLog('=== VALIDATING MODEL FOLDER ===', 'INFO');
    myLog(`Folder path: ${myFolderPath}`, 'INFO');
    
    try {
        // Normalize path for cross-platform compatibility
        const myNormalizedPath = myPath.normalize(myFolderPath);
        myLog(`Normalized path: ${myNormalizedPath}`, 'INFO');
        
        // Check if folder exists
        if (!myFs.existsSync(myNormalizedPath)) {
            throw new Error('Folder does not exist');
        }
        
        // Check if it's a directory
        const myStats = myFs.statSync(myNormalizedPath);
        if (!myStats.isDirectory()) {
            throw new Error('Path is not a directory');
        }
        
        myLog('Folder exists and is a directory', 'INFO');
        
        // Check for model.json
        const myModelJsonPath = myPath.join(myNormalizedPath, 'model.json');
        if (!myFs.existsSync(myModelJsonPath)) {
            throw new Error('model.json not found in folder');
        }
        
        myLog('Found model.json', 'SUCCESS');
        
        // Read and parse model.json to find weight files
        const myModelJsonContent = myFs.readFileSync(myModelJsonPath, 'utf8');
        const myModelData = JSON.parse(myModelJsonContent);
        
        const myWeightFiles = [];
        
        if (myModelData.weightsManifest) {
            myLog('Checking for weight files...', 'INFO');
            
            for (const manifest of myModelData.weightsManifest) {
                for (const weightPath of manifest.paths) {
                    const myFullWeightPath = myPath.join(myNormalizedPath, weightPath);
                    
                    if (myFs.existsSync(myFullWeightPath)) {
                        myWeightFiles.push(weightPath);
                        myLog(`Found weight file: ${weightPath}`, 'SUCCESS');
                    } else {
                        myLog(`Missing weight file: ${weightPath}`, 'WARN');
                    }
                }
            }
        } else {
            myLog('No weightsManifest in model.json', 'INFO');
        }
        
        myLog('=== VALIDATION SUCCESSFUL ===', 'SUCCESS');
        
        return {
            valid: true,
            normalizedPath: myNormalizedPath,
            weightFiles: myWeightFiles
        };
        
    } catch (error) {
        myLog(`Validation failed: ${error.message}`, 'ERROR');
        throw error;
    }
}

async function myConvertTFJSToTFLite(myFolderPath, myModelName) {
    myLog('=== STARTING TFLITE CONVERSION ===', 'INFO');
    myLog(`Model name: ${myModelName}`, 'INFO');
    myLog(`Source folder: ${myFolderPath}`, 'INFO');
    
    const myTimestamp = Date.now();
    const myWorkDir = myPath.join(myTFLiteDir, `${myModelName}_${myTimestamp}`);
    const myOutputPath = myPath.join(myWorkDir, `${myModelName}.tflite`);
    
    try {
        // Create working directory
        myFs.mkdirSync(myWorkDir, { recursive: true });
        myLog(`Created working directory: ${myWorkDir}`, 'INFO');
        
        // Normalize the source folder path
        const myNormalizedPath = myPath.normalize(myFolderPath);
        myLog(`Normalized source path: ${myNormalizedPath}`, 'INFO');
        
        // Create Python conversion script
        myLog('Creating Python conversion script...', 'INFO');
        
        // Escape path for Python (use forward slashes, escape backslashes)
        const myPythonPath = myNormalizedPath.replace(/\\/g, '/');
        const myPythonOutputPath = myOutputPath.replace(/\\/g, '/');
        
        const myPythonScript = `
import sys
import os
import tensorflowjs as tfjs
import tensorflow as tf

tfjs_path = r'${myPythonPath}'
output_path = r'${myPythonOutputPath}'

try:
    print(f'Loading TensorFlow.js model from: {tfjs_path}')
    model = tfjs.converters.load_keras_model(tfjs_path)
    print(f'Model loaded successfully!')
    print(f'Input shape: {model.input_shape}')
    print(f'Output shape: {model.output_shape}')
    
    print('Converting to TFLite with optimizations...')
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.target_spec.supported_types = [tf.float16]
    
    tflite_model = converter.convert()
    
    print(f'Writing TFLite model to: {output_path}')
    with open(output_path, 'wb') as f:
        f.write(tflite_model)
    
    size_kb = len(tflite_model) / 1024
    print(f'SUCCESS: Model saved ({size_kb:.2f} KB)')
    
except Exception as e:
    print(f'ERROR: {str(e)}')
    import traceback
    traceback.print_exc()
    sys.exit(1)
`;
        
        const myScriptPath = myPath.join(myWorkDir, 'convert.py');
        myFs.writeFileSync(myScriptPath, myPythonScript);
        myLog('Python script created', 'INFO');
        
        // Run Python conversion
        myLog('Executing Python conversion script...', 'INFO');
        const myStartTime = Date.now();
        
        const { myStdout, myStderr } = await new Promise((resolve, reject) => {
            myExec(`python "${myScriptPath}"`, { maxBuffer: 1024 * 500 }, (myError, myStdout, myStderr) => {
                const myDuration = ((Date.now() - myStartTime) / 1000).toFixed(2);
                
                if (myError) {
                    myLog(`Python conversion FAILED after ${myDuration}s`, 'ERROR');
                    myLog(`Exit code: ${myError.code}`, 'ERROR');
                    if (myStdout) myLog(`STDOUT:\n${myStdout}`, 'ERROR');
                    if (myStderr) myLog(`STDERR:\n${myStderr}`, 'ERROR');
                    return reject({ stdout: myStdout, stderr: myStderr });
                }
                
                myLog(`Python conversion completed in ${myDuration}s`, 'SUCCESS');
                resolve({ myStdout, myStderr });
            });
        });
        
        myLog(`Python output:\n${myStdout}`, 'INFO');
        
        // Read the converted TFLite model
        if (!myFs.existsSync(myOutputPath)) {
            throw new Error('TFLite file was not created');
        }
        
        const myTFLiteBuffer = myFs.readFileSync(myOutputPath);
        const myTFLiteBase64 = myTFLiteBuffer.toString('base64');
        
        myLog(`TFLite model size: ${(myTFLiteBuffer.length / 1024).toFixed(2)} KB`, 'SUCCESS');
        myLog('=== TFLITE CONVERSION SUCCESSFUL ===', 'SUCCESS');
        
        return {
            success: true,
            tfliteData: myTFLiteBase64,
            fileName: `${myModelName}.tflite`,
            sizeKB: (myTFLiteBuffer.length / 1024).toFixed(2),
            output: myStdout
        };
        
    } catch (error) {
        myLog('=== TFLITE CONVERSION FAILED ===', 'ERROR');
        throw error;
    }
}

// --- Route Handlers ---

// Arduino: Compile and Flash
myApp.post('/compile-flash', async (myReq, myRes) => {
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

// TFLite: Validate Model Path
myApp.post('/validate-model-path', async (myReq, myRes) => {
    myLog('=== NEW MODEL PATH VALIDATION REQUEST ===', 'INFO');
    
    const { folderPath: myFolderPath } = myReq.body;
    
    if (!myFolderPath) {
        myLog('Request rejected: No folder path provided', 'ERROR');
        return myRes.status(400).json({
            message: 'Missing folder path',
            error: 'folderPath is required'
        });
    }
    
    myLog(`Validating path: ${myFolderPath}`, 'INFO');
    
    try {
        const myResult = await myValidateModelFolder(myFolderPath);
        
        myRes.status(200).json({
            message: 'Model folder validation successful',
            normalizedPath: myResult.normalizedPath,
            weightFiles: myResult.weightFiles
        });
        
    } catch (myError) {
        myLog(`Validation failed: ${myError.message}`, 'ERROR');
        
        myRes.status(400).json({
            message: 'Model folder validation failed',
            error: myError.message
        });
    }
});

// TFLite: Convert TF.js to TFLite
myApp.post('/convert-tfjs-to-tflite', async (myReq, myRes) => {
    myLog('=== NEW TFLITE CONVERSION REQUEST ===', 'INFO');
    
    const { folderPath: myFolderPath, modelName: myModelName = 'model' } = myReq.body;
    
    if (!myFolderPath) {
        myLog('Request rejected: No folder path provided', 'ERROR');
        return myRes.status(400).json({
            message: 'Missing folder path',
            error: 'folderPath is required'
        });
    }
    
    myLog(`Converting model from: ${myFolderPath}`, 'INFO');
    myLog(`Model name: ${myModelName}`, 'INFO');
    
    try {
        const myResult = await myConvertTFJSToTFLite(myFolderPath, myModelName);
        
        myRes.status(200).json({
            message: 'TFLite conversion successful!',
            tfliteData: myResult.tfliteData,
            fileName: myResult.fileName,
            sizeKB: myResult.sizeKB,
            output: myResult.output
        });
        
    } catch (myError) {
        myLog('Conversion failed', 'ERROR');
        
        myRes.status(500).json({
            message: 'TFLite conversion failed',
            error: myError.stderr || myError.message || myError.toString()
        });
    }
});

// Serial Stream (SSE)
myApp.get('/serial-stream', (myReq, myRes) => {
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

// Health Check
myApp.get('/health', (myReq, myRes) => {
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

// Root
myApp.get('/', (myReq, myRes) => {
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

// Start Server
myApp.listen(myPort, () => {
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
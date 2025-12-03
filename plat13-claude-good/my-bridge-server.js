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

4. INSTALL PYTHON DEPENDENCIES (for Keras conversion via WSL):
   wsl pip install tensorflow tensorflowjs

5. CREATE THIS FILE:
   Save as: my-bridge-server.js

6. RUN THE SERVER:
   node my-bridge-server.js

7. REQUIREMENTS:
   - Node.js (v14 or higher)
   - Python 3.7+ with tensorflow and tensorflowjs (in WSL)
   - PlatformIO Core CLI installed and in PATH
   - Arduino board connected via USB
   - WSL (Windows Subsystem for Linux) for TFLite conversion

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

// Use built-in Express middleware
myApp.use(myExpress.json({ limit: '100mb' }));
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
        return { success: false, port: null };
    }
    
    try {
        myActiveSerialPort = new SerialPort({
            path: myPortPath,
            baudRate: myBaudRate,
            autoOpen: false
        });
        
        const myParser = myActiveSerialPort.pipe(new ReadlineParser({ delimiter: '\n' }));
        
        return new Promise((resolve) => {
            myActiveSerialPort.open((err) => {
                if (err) {
                    myLog(`Failed to open serial port: ${err.message}`, 'ERROR');
                    resolve({ success: false, port: null });
                    return;
                }
                
                myLog(`Serial monitor started on ${myPortPath} at ${myBaudRate} baud`, 'SUCCESS');
                
                myParser.on('data', (myLine) => {
                    const myMessage = myLine.toString().trim();
                    if (myMessage) {
                        myLog(`[SERIAL] ${myMessage}`, 'INFO');
                        
                        mySerialClients.forEach(client => {
                            try {
                                client.write(`data: ${JSON.stringify({ type: 'serial', message: myMessage })}\n\n`);
                            } catch (err) {
                                myLog(`Error writing to serial client: ${err.message}`, 'ERROR');
                            }
                        });
                    }
                });
                
                myActiveSerialPort.on('error', (err) => {
                    myLog(`Serial port error: ${err.message}`, 'ERROR');
                });
                
                myActiveSerialPort.on('close', () => {
                    myLog('Serial port closed', 'INFO');
                });
                
                resolve({ success: true, port: myPortPath });
            });
        });
    } catch (error) {
        myLog(`Error starting serial monitor: ${error.message}`, 'ERROR');
        return { success: false, port: null };
    }
}

// --- TFLite/Keras Conversion Helper Functions ---

async function myConvertTFJSToKeras(myFolderPath, myModelName) {
    myLog('=== STARTING KERAS CONVERSION VIA WSL ===', 'INFO');
    myLog(`Model name: ${myModelName}`, 'INFO');
    myLog(`Input folder: ${myFolderPath}`, 'INFO');
    
    // Convert Windows path to WSL path
    const myWslPath = myFolderPath.replace(/\\/g, '/').replace(/^([A-Z]):/, (match, drive) => {
        return `/mnt/${drive.toLowerCase()}`;
    });
    
    const myOutputDir = myPath.join(myFolderPath, 'myOutput');
    const myOutputPath = myPath.join(myOutputDir, `${myModelName}.h5`);
    
    const myWslOutputPath = myOutputPath.replace(/\\/g, '/').replace(/^([A-Z]):/, (match, drive) => {
        return `/mnt/${drive.toLowerCase()}`;
    });
    
    try {
        // Create output directory
        if (!myFs.existsSync(myOutputDir)) {
            myFs.mkdirSync(myOutputDir, { recursive: true });
            myLog(`Created output directory: ${myOutputDir}`, 'INFO');
        }
        
        // Create Python conversion script
        myLog('Creating Python conversion script for WSL...', 'INFO');
        const myPythonScript = `
import sys
import os
import tensorflowjs as tfjs
import tensorflow as tf

input_path = '${myWslPath}'
output_path = '${myWslOutputPath}'

try:
    print('Loading TensorFlow.js model from:', input_path)
    model = tfjs.converters.load_keras_model(input_path)
    print(f'Model loaded successfully')
    print(f'Input shape: {model.input_shape}')
    print(f'Output shape: {model.output_shape}')
    
    print('Saving as Keras .h5 format...')
    model.save(output_path)
    
    file_size = os.path.getsize(output_path)
    size_kb = file_size / 1024
    print(f'SUCCESS: Model saved to {output_path}')
    print(f'File size: {size_kb:.2f} KB')
    
except Exception as e:
    print(f'ERROR: {str(e)}')
    import traceback
    traceback.print_exc()
    sys.exit(1)
`;
        
        const myScriptPath = myPath.join(myOutputDir, 'convert_wsl.py');
        myFs.writeFileSync(myScriptPath, myPythonScript);
        myLog('Python script created', 'INFO');
        
        const myWslScriptPath = myScriptPath.replace(/\\/g, '/').replace(/^([A-Z]):/, (match, drive) => {
            return `/mnt/${drive.toLowerCase()}`;
        });
        
        // Run Python conversion via WSL
        myLog('Executing Python conversion script via WSL...', 'INFO');
        const myStartTime = Date.now();
        
        const myCommand = `wsl python3 "${myWslScriptPath}"`;
        myLog(`Running command: ${myCommand}`, 'INFO');
        
        const { myStdout, myStderr } = await new Promise((resolve, reject) => {
            myExec(myCommand, { maxBuffer: 1024 * 500 }, (myError, myStdout, myStderr) => {
                const myDuration = ((Date.now() - myStartTime) / 1000).toFixed(2);
                
                if (myError) {
                    myLog(`WSL Python conversion FAILED after ${myDuration}s`, 'ERROR');
                    myLog(`STDOUT: ${myStdout}`, 'ERROR');
                    myLog(`STDERR: ${myStderr}`, 'ERROR');
                    return reject({ stdout: myStdout, stderr: myStderr });
                }
                
                myLog(`WSL Python conversion completed in ${myDuration}s`, 'SUCCESS');
                resolve({ myStdout, myStderr });
            });
        });
        
        myLog(`Python output: ${myStdout}`, 'INFO');
        
        // Verify the output file exists
        if (!myFs.existsSync(myOutputPath)) {
            throw new Error('Keras .h5 file was not created');
        }
        
        const myStats = myFs.statSync(myOutputPath);
        myLog(`Keras model size: ${(myStats.size / 1024).toFixed(2)} KB`, 'SUCCESS');
        myLog('=== KERAS CONVERSION SUCCESSFUL ===', 'SUCCESS');
        
        return {
            success: true,
            outputPath: myOutputPath,
            fileName: `${myModelName}.h5`,
            output: myStdout
        };
        
    } catch (error) {
        myLog('=== KERAS CONVERSION FAILED ===', 'ERROR');
        throw error;
    }
}

// --- Route Handlers ---

// Serial: Manual Connect
myApp.post('/serial-connect', async (myReq, myRes) => {
    myLog('=== SERIAL CONNECTION REQUEST ===', 'INFO');
    
    try {
        const myResult = await myStartSerialMonitor(9600);
        
        if (myResult.success) {
            myRes.status(200).json({
                message: 'Serial monitor connected',
                port: myResult.port
            });
        } else {
            myRes.status(500).json({
                message: 'Failed to connect to serial port',
                error: 'No port detected or connection failed'
            });
        }
    } catch (error) {
        myRes.status(500).json({
            message: 'Serial connection error',
            error: error.message
        });
    }
});

// Arduino: Compile and Flash
myApp.post('/compile-flash', async (myReq, myRes) => {
    myLog('=== NEW COMPILE & FLASH REQUEST ===', 'INFO');
    
    const { code: myCode, board: myBoardName = 'uno', config: myConfig, folderPath: myFolderPath } = myReq.body; 
    
    myLog(`Board: ${myBoardName}`, 'INFO');
    myLog(`Folder: ${myFolderPath}`, 'INFO');
    myLog(`Code length: ${myCode ? myCode.length : 0} characters`, 'INFO');
    
    if (!myCode) {
        myLog('Request rejected: No code provided', 'ERROR');
        return myRes.status(400).json({ 
            message: 'Missing Arduino code.', 
            error: 'Code field is empty.' 
        });
    }
    
    if (!myFolderPath) {
        myLog('Request rejected: No folder path provided', 'ERROR');
        return myRes.status(400).json({ 
            message: 'Missing folder path.', 
            error: 'PlatformIO working folder not selected.' 
        });
    }

    try {
        myLog('Step 1: Setting up project structure', 'INFO');
        
        const mySrcDir = myPath.join(myFolderPath, 'src');
        if (!myFs.existsSync(mySrcDir)) {
            myFs.mkdirSync(mySrcDir, { recursive: true });
            myLog(`Created src directory: ${mySrcDir}`, 'INFO');
        }
        
        // Write platformio.ini
        const myIniPath = myPath.join(myFolderPath, 'platformio.ini');
        myFs.writeFileSync(myIniPath, myConfig);
        myLog(`platformio.ini written to: ${myIniPath}`, 'INFO');
        
        // Write main.cpp
        const mySourceFile = myPath.join(mySrcDir, 'main.cpp');
        myFs.writeFileSync(mySourceFile, myCode, 'utf8');
        myLog(`Code written to: ${mySourceFile}`, 'INFO');
        
        myLog('Step 2: Executing PlatformIO compilation and upload', 'INFO');
        const myCommand = `pio run -d "${myFolderPath}" --target upload`;
        myLog(`Running command: ${myCommand}`, 'INFO');
        
        const myStartTime = Date.now();
        const { myStdout, myStderr } = await new Promise((resolve, reject) => {
            myExec(myCommand, { maxBuffer: 1024 * 500 }, (myError, myStdout, myStderr) => {
                const myDuration = ((Date.now() - myStartTime) / 1000).toFixed(2);
                
                if (myError) {
                    myLog(`PlatformIO execution FAILED after ${myDuration}s`, 'ERROR');
                    if (myStdout) myLog('STDOUT: ' + myStdout, 'ERROR');
                    if (myStderr) myLog('STDERR: ' + myStderr, 'ERROR');
                    return reject({ stdout: myStdout, stderr: myStderr });
                }
                
                myLog(`PlatformIO execution completed successfully in ${myDuration}s`, 'SUCCESS');
                resolve({ myStdout, myStderr });
            });
        });

        myLog('=== REQUEST COMPLETED SUCCESSFULLY ===', 'SUCCESS');
        
        myRes.status(200).json({ 
            message: `Compilation and Upload for ${myBoardName} succeeded!`,
            output: myStdout.trim()
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

// PlatformIO Config: Save
myApp.post('/save-platformio-config', async (myReq, myRes) => {
    myLog('=== SAVE PLATFORMIO CONFIG REQUEST ===', 'INFO');
    
    const { folderPath: myFolderPath, config: myConfig } = myReq.body;
    
    if (!myFolderPath || !myConfig) {
        return myRes.status(400).json({
            message: 'Missing folder path or config',
            error: 'Both folderPath and config are required'
        });
    }
    
    try {
        const myIniPath = myPath.join(myFolderPath, 'platformio.ini');
        myFs.writeFileSync(myIniPath, myConfig);
        myLog(`platformio.ini saved to: ${myIniPath}`, 'SUCCESS');
        
        myRes.status(200).json({
            message: 'platformio.ini saved successfully',
            path: myIniPath
        });
    } catch (error) {
        myLog(`Failed to save platformio.ini: ${error.message}`, 'ERROR');
        myRes.status(500).json({
            message: 'Failed to save platformio.ini',
            error: error.message
        });
    }
});

// File Browser: Select Folder (simulated - requires native dialog in production)
myApp.post('/select-folder', async (myReq, myRes) => {
    myLog('=== FOLDER SELECTION REQUEST ===', 'INFO');
    
    const { type: myType } = myReq.body;
    
    // NOTE: IMPORTANT - Folder Browser Implementation
    // This is a simplified implementation that returns default paths.
    // 
    // FOR PRODUCTION, implement ONE of these solutions:
    //
    // OPTION 1: Use Electron (Recommended for desktop apps)
    //   const { dialog } = require('electron');
    //   const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    //   const folderPath = result.filePaths[0];
    //
    // OPTION 2: Use a Node.js native dialog package
    //   npm install node-file-dialog
    //   const fileDialog = require('node-file-dialog');
    //   const folderPath = await fileDialog.selectDirectory();
    //
    // OPTION 3: Create a simple web form where users paste the path
    //   (Current implementation - users can type path in the text box)
    //
    // For now, users should manually type the folder path in the text input field.
    // The text box is editable and will accept any valid folder path.
    
    const myDefaultPaths = {
        pio: myPath.join(__dirname, 'myPioProject'),
        tflite: myPath.join(__dirname, 'myTFLiteModels')
    };
    
    const myFolderPath = myDefaultPaths[myType] || __dirname;
    
    // Create the folder if it doesn't exist
    if (!myFs.existsSync(myFolderPath)) {
        myFs.mkdirSync(myFolderPath, { recursive: true });
        myLog(`Created default folder: ${myFolderPath}`, 'INFO');
    }
    
    myLog(`Returning default ${myType} folder: ${myFolderPath}`, 'INFO');
    myLog('NOTE: Users can manually edit the path in the text box', 'INFO');
    
    myRes.status(200).json({
        message: 'Default folder path returned. You can edit this path manually in the text box.',
        folderPath: myFolderPath
    });
});

// TFLite: Convert TF.js to Keras via WSL
myApp.post('/convert-tfjs-to-keras', async (myReq, myRes) => {
    myLog('=== NEW KERAS CONVERSION REQUEST ===', 'INFO');
    
    const { folderPath: myFolderPath, modelName: myModelName = 'model' } = myReq.body;
    
    if (!myFolderPath) {
        myLog('Request rejected: No folder path', 'ERROR');
        return myRes.status(400).json({
            message: 'Missing folder path',
            error: 'folderPath is required'
        });
    }
    
    // Verify model.json exists
    const myModelJsonPath = myPath.join(myFolderPath, 'model.json');
    if (!myFs.existsSync(myModelJsonPath)) {
        myLog('Request rejected: model.json not found', 'ERROR');
        return myRes.status(400).json({
            message: 'model.json not found',
            error: `No model.json file in ${myFolderPath}`
        });
    }
    
    myLog(`model.json found at: ${myModelJsonPath}`, 'INFO');
    
    try {
        const myResult = await myConvertTFJSToKeras(myFolderPath, myModelName);
        
        myRes.status(200).json({
            message: 'Keras conversion successful!',
            outputPath: myResult.outputPath,
            fileName: myResult.fileName,
            output: myResult.output
        });
        
    } catch (myError) {
        myLog('Conversion failed', 'ERROR');
        
        myRes.status(500).json({
            message: 'Keras conversion failed',
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
            <li><strong>POST /serial-connect</strong> - Connect to serial monitor</li>
            <li><strong>GET /serial-stream</strong> - Serial data stream (SSE)</li>
            <li><strong>POST /convert-tfjs-to-keras</strong> - Convert TensorFlow.js to Keras .h5 (WSL)</li>
            <li><strong>POST /select-folder</strong> - Select working folder</li>
            <li><strong>POST /save-platformio-config</strong> - Save platformio.ini</li>
            <li><strong>GET /health</strong> - Health check</li>
        </ul>
        <h2>Status:</h2>
        <p>Serial Monitor: <strong>${myActiveSerialPort && myActiveSerialPort.isOpen ? 'Active' : 'Inactive'}</strong></p>
        <p>Connected Clients: <strong>${mySerialClients.length}</strong></p>
    `);
});

// Start Server
myApp.listen(myPort, () => {
    myLog('='.repeat(60), 'INFO');
    myLog('✨ PlatformIO Bridge Server is RUNNING', 'SUCCESS');
    myLog(`Server URL: http://localhost:${myPort}`, 'SUCCESS');
    myLog('='.repeat(60), 'INFO');
    myLog('REQUIREMENTS:', 'WARN');
    myLog('  - PlatformIO Core (CLI) installed', 'WARN');
    myLog('  - Python 3 with tensorflow & tensorflowjs (in WSL)', 'WARN');
    myLog('  - npm install express serialport', 'WARN');
    myLog('  - WSL enabled for TensorFlow conversions', 'WARN');
    myLog('To test: Open http://localhost:8080', 'INFO');
    myLog('Press Ctrl+C to stop', 'INFO');
});
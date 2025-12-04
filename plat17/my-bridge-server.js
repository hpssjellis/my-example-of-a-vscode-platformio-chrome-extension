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

5. CREATE THESE FILES:
   - Save this file as: my-bridge-server.js
   - Create: model_converter.py (in this same Windows directory)
   - Create: run_converter.sh (in your WSL VENV folder: /home/jerteach/tf-env/run_converter.sh)
     NOTE: The .sh file must contain the portable, CPU-only logic.

6. RUN THE SERVER:
   node my-bridge-server.js

7. REQUIREMENTS:
   - Node.js (v14 or higher)
   - Python 3.7+ with tensorflow and tensorflowjs (in WSL, preferably in /home/jerteach/tf-env)
   - PlatformIO Core CLI installed and in PATH
   - Arduino board connected via USB
   - WSL (Windows Subsystem for Linux) for TFLite conversion

===============================================================================
*/

const myExpress = require('express');
const { exec: myExec } = require('child_process');
const { promisify } = require('util'); // Import promisify for async/await pattern
const myFs = require('fs');
const myPath = require('path');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

// Promisify exec for clean async/await use
const myExecPromise = promisify(myExec);

// Use my descriptive, camelCase variable names
const myApp = myExpress();
const myPort = 8080;

// Serial port tracking
let myActiveSerialPort = null;
let mySerialClients = [];

// --- CRITICAL CONFIGURATION ---
// These paths must be correctly defined:
// 1. Path to the shell wrapper script in your WSL virtual environment folder (Scalable Location)
const myWslWrapperPath = '/home/jerteach/tf-env/run_converter.sh'; 
// 2. Path to the reusable Python script in the Windows environment
const myPythonScriptPath = myPath.join(__dirname, 'model_converter.py'); 

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

/**
 * Closes the active serial port and clears all streaming clients.
 * This is crucial for releasing the port for other applications (like PlatformIO CLI).
 */
async function myStopSerialMonitor() {
    if (myActiveSerialPort && myActiveSerialPort.isOpen) {
        myLog('Stopping serial monitor and closing port...', 'INFO');
        
        // Signal and close all SSE clients
        mySerialClients.forEach(client => {
            try {
                // Inform client about server-side closure
                client.write(`data: ${JSON.stringify({ type: 'disconnected', message: 'Server closing connection' })}\n\n`);
                client.end(); // Close the SSE connection
            } catch (err) {
                // Ignore errors on clients that might already be closing
            }
        });
        mySerialClients = []; // Clear clients
        
        // Use a promise-based close to wait for port to be truly released
        await new Promise((resolve) => {
            myActiveSerialPort.close((err) => {
                if (err) {
                    myLog(`Error closing serial port: ${err.message}`, 'ERROR');
                } else {
                    myLog('Serial port successfully closed', 'SUCCESS');
                }
                resolve();
            });
        });
        myActiveSerialPort = null;
        return { success: true, message: 'Serial port closed by user request' };
    }
    myLog('Serial port already inactive or closed', 'INFO');
    return { success: true, message: 'Serial port was already inactive' };
}

async function myStartSerialMonitor(myBaudRate = 9600) {
    // CRITICAL: Close any existing connection first to ensure resource release
    await myStopSerialMonitor();
    
    // Small delay is still prudent to wait for OS resource release
    await new Promise(resolve => setTimeout(resolve, 500));
    
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

// Helper function to convert Windows C: paths to WSL /mnt/c/ paths
function myToWslPath(myWindowsPath) {
    // Replaces \ with / and C: with /mnt/c
    return myWindowsPath.replace(/\\/g, '/').replace(/^([A-Z]):/, (match, drive) => {
        return `/mnt/${drive.toLowerCase()}`;
    });
}

async function myConvertTFJSToKeras(myFolderPath, myModelName) {
    myLog('=== STARTING KERAS CONVERSION VIA WSL ===', 'INFO');
    myLog(`Model name: ${myModelName}`, 'INFO');
    myLog(`Input folder (Windows): ${myFolderPath}`, 'INFO');
    
    // Define all Windows paths
    const myOutputDir = myPath.join(myFolderPath, 'myOutput');
    const myOutputPath = myPath.join(myOutputDir, `${myModelName}.h5`);
    
    // Convert all paths to WSL format
    const myWslPythonScriptPath = myToWslPath(myPythonScriptPath);
    const myWslInputPath = myToWslPath(myFolderPath);
    const myWslOutputPath = myToWslPath(myOutputPath);
    
    try {
        // Create output directory on Windows before running the script
        if (!myFs.existsSync(myOutputDir)) {
            myFs.mkdirSync(myOutputDir, { recursive: true });
            myLog(`Created output directory: ${myOutputDir}`, 'INFO');
        }
        
        // BUILD COMMAND: wsl [wrapper_script] [arg1: py_path] [arg2: input_path] [arg3: output_path] [arg4: model_name]
        // Note: The model_converter.py script uses argument 4 to confirm the name.
        const myCommand = `wsl "${myWslWrapperPath}" "${myWslPythonScriptPath}" "${myWslInputPath}" "${myWslOutputPath}" "${myModelName}"`;
        myLog(`Executing command: ${myCommand}`, 'INFO');
        
        const myStartTime = Date.now();
        
        // Execute the command using the promisified exec function
        const { stdout: myStdout, stderr: myStderr } = await myExecPromise(myCommand, { maxBuffer: 1024 * 500 });

        const myDuration = ((Date.now() - myStartTime) / 1000).toFixed(2);
        
        if (myStderr) {
            myLog(`WSL Python conversion completed with warnings/minor errors in ${myDuration}s`, 'WARN');
            myLog(`STDERR: ${myStderr}`, 'WARN');
        } else {
            myLog(`WSL Python conversion completed successfully in ${myDuration}s`, 'SUCCESS');
        }
        
        myLog(`Python STDOUT: ${myStdout}`, 'INFO');
        
        // Verify the output file exists
        if (!myFs.existsSync(myOutputPath)) {
            throw new Error('Keras .h5 file was not created. Check WSL environment, tf-env activation, and Python script output for errors.');
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
        
    } catch (myException) {
        myLog('=== KERAS CONVERSION FAILED ===', 'ERROR');
        // Handle rejection from myExecPromise, which is usually a non-zero exit code
        const myErrorOutput = myException.stderr || myException.stdout || myException.message;
        myLog(`Full Error Output: ${myErrorOutput}`, 'ERROR');
        
        throw new Error(`Conversion failed. Output: ${myErrorOutput}`);
    }
}

// --- Route Handlers ---

// Serial: Manual Connect
myApp.post('/serial-connect', async (myReq, myRes) => {
    myLog('=== SERIAL CONNECTION REQUEST ===', 'INFO');
    
    try {
        // Note: myStartSerialMonitor now calls myStopSerialMonitor internally
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

// Serial: Manual Disconnect (NEW ROUTE)
myApp.post('/serial-disconnect', async (myReq, myRes) => {
    myLog('=== SERIAL DISCONNECTION REQUEST ===', 'INFO');
    
    try {
        const myResult = await myStopSerialMonitor();
        
        myRes.status(200).json({
            message: 'Serial monitor disconnected from bridge server',
            details: myResult.message
        });
    } catch (error) {
        myRes.status(500).json({
            message: 'Serial disconnection error on bridge server',
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
        // Use promisified exec
        const { stdout: myStdout, stderr: myStderr } = await myExecPromise(myCommand, { maxBuffer: 1024 * 500 });

        const myDuration = ((Date.now() - myStartTime) / 1000).toFixed(2);
        
        if (myStderr) {
             // PlatformIO often writes warnings/non-critical info to stderr
             myLog('PlatformIO STDERR (Warnings/Info): ' + myStderr, 'WARN');
        }

        myLog(`PlatformIO execution completed successfully in ${myDuration}s`, 'SUCCESS');
        myLog('=== REQUEST COMPLETED SUCCESSFULLY ===', 'SUCCESS');
        
        myRes.status(200).json({ 
            message: `Compilation and Upload for ${myBoardName} succeeded!`,
            output: myStdout.trim()
        });

    } catch (myException) {
        myLog('=== REQUEST FAILED ===', 'ERROR');
        // Check for stdout/stderr properties added by the child_process Error object
        const myErrorOutput = myException.stderr || myException.stdout || myException.message;
        
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
    
    // NOTE: For Production, implement a native dialog solution (Electron/node-file-dialog)
    
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
    
    // Verify model.json exists (part of the TensorFlow.js model)
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
            error: myError.message || myError.toString() // Capture the error message thrown by the function
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
        // This only removes the client from our list, it does NOT close the serial port.
        // The serial port is closed via /serial-disconnect or by /compile-flash.
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
            <li><strong>POST /serial-disconnect</strong> - Disconnect serial monitor (NEW)</li>
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
    myLog('  - Python 3 with tensorflow & tensorflowjs (in WSL and tf-env)', 'WARN');
    myLog('  - npm install express serialport', 'WARN');
    myLog('  - WSL enabled for TensorFlow conversions', 'WARN');
    myLog('To test: Open http://localhost:8080', 'INFO');
    myLog('Press Ctrl+C to stop', 'INFO');
});
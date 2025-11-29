/*
SETUP INSTRUCTIONS:
mkdir my-pio-bridge
cd my-pio-bridge
npm init -y
npm install express serialport
node my-bridge-server.js
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

// Use built-in Express middleware to parse incoming JSON request bodies
myApp.use(myExpress.json());
myLog('JSON body parser middleware enabled', 'INFO');

// Set up CORS to allow the Chrome extension to connect
myApp.use((myReq, myRes, myNext) => {
    myRes.setHeader('Access-Control-Allow-Origin', '*'); 
    myRes.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    myRes.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Log incoming requests
    myLog(`${myReq.method} ${myReq.url} from ${myReq.ip}`, 'REQUEST');
    
    myNext();
});

// Handle OPTIONS preflight requests
myApp.options('*', (myReq, myRes) => {
    myLog('Received OPTIONS preflight request', 'INFO');
    myRes.sendStatus(200);
});

// --- Helper Functions ---

/**
 * Maps simple board names to PlatformIO's required settings.
 */
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

/**
 * Initializes a new PlatformIO project structure.
 */
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
    myLog(`Configuration:\n${myIniContent.trim()}`, 'INFO');
    
    return myConfig;
}

/**
 * Detects the serial port for the connected Arduino
 */
async function myDetectSerialPort() {
    myLog('Detecting Arduino serial port...', 'INFO');
    
    try {
        const ports = await SerialPort.list();
        myLog(`Found ${ports.length} serial ports`, 'INFO');
        
        // Look for common Arduino manufacturers
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
            myLog(`Manufacturer: ${myArduinoPort.manufacturer}`, 'INFO');
            return myArduinoPort.path;
        }
        
        // Fallback: return first available port
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
 * Opens serial connection and starts monitoring
 */
async function myStartSerialMonitor(myBaudRate = 9600) {
    // Close existing connection if any
    if (myActiveSerialPort && myActiveSerialPort.isOpen) {
        myLog('Closing existing serial connection...', 'INFO');
        myActiveSerialPort.close();
        myActiveSerialPort = null;
    }
    
    // Wait a moment for port to be released after upload
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
            
            // Broadcast serial data to all connected clients
            myParser.on('data', (myLine) => {
                const myMessage = myLine.toString().trim();
                if (myMessage) {
                    myLog(`[SERIAL] ${myMessage}`, 'INFO');
                    
                    // Send to all SSE clients
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

// --- Route Handlers ---

// Main POST endpoint to compile and flash
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
        // 1. Initialize project
        myLog('Step 1: Initializing project structure', 'INFO');
        const myConfig = myInitPioProject(myBoardName);

        // 2. Write code
        myLog('Step 2: Writing code to source file', 'INFO');
        myFs.writeFileSync(mySourceFile, myCode, 'utf8');
        myLog(`Code successfully written to: ${mySourceFile}`, 'INFO');
        
        const myCodePreview = myCode.split('\n').slice(0, 3).join('\n');
        myLog(`Code preview:\n${myCodePreview}...`, 'INFO');
        
        // 3. Compile and upload
        myLog('Step 3: Executing PlatformIO compilation and upload', 'INFO');
        const myCommand = `pio run -d "${myProjectDir}" --target upload`;
        myLog(`Running command: ${myCommand}`, 'INFO');
        
        const myStartTime = Date.now();
        const { myStdout, myStderr } = await new Promise((resolve, reject) => {
            myExec(myCommand, { maxBuffer: 1024 * 500 }, (myError, myStdout, myStderr) => {
                const myDuration = ((Date.now() - myStartTime) / 1000).toFixed(2);
                
                if (myError) {
                    myLog(`PlatformIO execution FAILED after ${myDuration}s`, 'ERROR');
                    myLog(`Exit code: ${myError.code}`, 'ERROR');
                    
                    if (myStdout) myLog('=== STDOUT ===\n' + myStdout, 'ERROR');
                    if (myStderr) myLog('=== STDERR ===\n' + myStderr, 'ERROR');
                    
                    return reject({ stdout: myStdout, stderr: myStderr, code: myError.code }); 
                }
                
                myLog(`PlatformIO execution completed successfully in ${myDuration}s`, 'SUCCESS');
                resolve({ myStdout, myStderr });
            });
        });

        // 4. Start serial monitor
        myLog('Step 4: Starting serial monitor...', 'INFO');
        const mySerialStarted = await myStartSerialMonitor(myConfig.baudRate);
        
        // 5. Send success response
        myLog('Step 5: Sending success response to client', 'SUCCESS');
        myLog('=== REQUEST COMPLETED SUCCESSFULLY ===', 'SUCCESS');
        
        myRes.status(200).json({ 
            message: `Compilation and Upload for ${myBoardName} (${myConfig.board}) succeeded!`,
            output: myStdout.trim(),
            serialMonitor: mySerialStarted ? 'started' : 'failed'
        });

    } catch (myException) {
        myLog('=== REQUEST FAILED ===', 'ERROR');
        
        const myErrorOutput = myException.stderr || myException.stdout || myException.toString();
        myLog('Sending error response to client', 'ERROR');
        
        myRes.status(500).json({ 
            message: 'Compilation or Upload failed. Check the error details below.', 
            error: myErrorOutput.trim()
        });
    }
});

// SSE endpoint for serial data streaming
myApp.get('/serial-stream', (myReq, myRes) => {
    myLog('New serial stream client connected', 'INFO');
    
    // Set headers for SSE
    myRes.setHeader('Content-Type', 'text/event-stream');
    myRes.setHeader('Cache-Control', 'no-cache');
    myRes.setHeader('Connection', 'keep-alive');
    myRes.setHeader('Access-Control-Allow-Origin', '*');
    
    // Add client to list
    mySerialClients.push(myRes);
    myLog(`Total serial clients: ${mySerialClients.length}`, 'INFO');
    
    // Send initial connection message
    myRes.write(`data: ${JSON.stringify({ type: 'connected', message: 'Serial stream connected' })}\n\n`);
    
    // Remove client on disconnect
    myReq.on('close', () => {
        myLog('Serial stream client disconnected', 'INFO');
        mySerialClients = mySerialClients.filter(client => client !== myRes);
        myLog(`Total serial clients: ${mySerialClients.length}`, 'INFO');
    });
});

// Health check endpoint
myApp.get('/health', (myReq, myRes) => {
    myLog('Health check request received', 'INFO');
    myRes.json({ 
        status: 'running',
        timestamp: new Date().toISOString(),
        projectDir: myProjectDir,
        serialMonitor: myActiveSerialPort && myActiveSerialPort.isOpen ? 'active' : 'inactive',
        serialClients: mySerialClients.length
    });
});

// Root endpoint
myApp.get('/', (myReq, myRes) => {
    myLog('Root endpoint accessed', 'INFO');
    myRes.send(`
        <h1>PlatformIO Bridge Server</h1>
        <p>Status: <strong style="color: green;">Running</strong></p>
        <p>Endpoints:</p>
        <ul>
            <li>POST /compile-flash - Compile and upload Arduino code</li>
            <li>GET /serial-stream - Server-Sent Events stream for serial data</li>
            <li>GET /health - Health check</li>
        </ul>
        <p>Project Directory: <code>${myProjectDir}</code></p>
        <p>Serial Monitor: <strong>${myActiveSerialPort && myActiveSerialPort.isOpen ? 'Active' : 'Inactive'}</strong></p>
        <p>Connected Clients: <strong>${mySerialClients.length}</strong></p>
    `);
});

// Start the server
myApp.listen(myPort, () => {
    myLog('='.repeat(60), 'INFO');
    myLog('✨ PlatformIO Bridge Server is RUNNING', 'SUCCESS');
    myLog(`Server URL: http://localhost:${myPort}`, 'SUCCESS');
    myLog(`Project Directory: ${myProjectDir}`, 'INFO');
    myLog('='.repeat(60), 'INFO');
    myLog('REQUIREMENTS:', 'WARN');
    myLog('  - PlatformIO Core (CLI) must be installed', 'WARN');
    myLog('  - npm install serialport (for serial monitoring)', 'WARN');
    myLog('To test: Open http://localhost:8080 in your browser', 'INFO');
    myLog('Press Ctrl+C to stop the server', 'INFO');
});
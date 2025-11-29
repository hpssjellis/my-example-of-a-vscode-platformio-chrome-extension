/*
SETUP INSTRUCTIONS:
mkdir my-pio-bridge
cd my-pio-bridge
npm init -y
npm install express
node my-bridge-server.js
*/

const myExpress = require('express');
const { exec: myExec } = require('child_process');
const myFs = require('fs');
const myPath = require('path');

// Use my descriptive, camelCase variable names
const myApp = myExpress();
const myPort = 8080;
const myProjectDir = myPath.join(__dirname, 'myPioProject');
const mySourceFile = myPath.join(myProjectDir, 'src', 'main.cpp');

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
    myRes.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    myRes.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Log incoming requests
    myLog(`${myReq.method} ${myReq.url} from ${myReq.ip}`, 'REQUEST');
    
    myNext();
});

// Handle OPTIONS preflight requests
myApp.options('/compile-flash', (myReq, myRes) => {
    myLog('Received OPTIONS preflight request', 'INFO');
    myRes.sendStatus(200);
});

// --- Helper Functions ---

/**
 * Maps simple board names to PlatformIO's required settings.
 * This is crucial for cross-platform compatibility.
 */
function myGetPioConfig(myBoardId) {
    myLog(`Looking up PlatformIO config for board: ${myBoardId}`, 'INFO');
    
    let myConfig;
    switch (myBoardId) {
        case 'nano33ble':
            myConfig = { platform: 'nordicnrf52', board: 'nano33ble' };
            break;
        case 'uno':
            myConfig = { platform: 'atmelavr', board: 'uno' };
            break;
        case 'nano':
            myConfig = { platform: 'atmelavr', board: 'nanoatmega328' };
            break;
        default:
            myLog(`Unknown board '${myBoardId}', defaulting to Arduino Uno`, 'WARN');
            myConfig = { platform: 'atmelavr', board: 'uno' };
    }
    
    myLog(`Config resolved: platform=${myConfig.platform}, board=${myConfig.board}`, 'INFO');
    return myConfig;
}

/**
 * Initializes a new PlatformIO project structure and writes the platformio.ini file.
 */
function myInitPioProject(myBoardId) {
    myLog('Initializing PlatformIO project...', 'INFO');
    
    const myConfig = myGetPioConfig(myBoardId);
    
    // Create directories if they don't exist (synchronous for setup phase)
    const mySrcDir = myPath.join(myProjectDir, 'src');
    myLog(`Creating project directory: ${myProjectDir}`, 'INFO');
    myFs.mkdirSync(mySrcDir, { recursive: true });
    myLog(`Source directory ready: ${mySrcDir}`, 'INFO');
    
    // Write the dynamic platformio.ini file
    const myIniContent = 
`[env:${myConfig.board}]
platform = ${myConfig.platform}
board = ${myConfig.board}
framework = arduino
`;
    const myIniPath = myPath.join(myProjectDir, 'platformio.ini');
    myFs.writeFileSync(myIniPath, myIniContent);
    myLog(`platformio.ini written to: ${myIniPath}`, 'INFO');
    myLog(`Configuration:\n${myIniContent.trim()}`, 'INFO');
    
    return myConfig;
}

// --- Route Handler ---

// The main POST endpoint to receive and process the code
myApp.post('/compile-flash', async (myReq, myRes) => {
    myLog('=== NEW COMPILE & FLASH REQUEST ===', 'INFO');
    
    // Destructure payload, default board to 'uno' if not provided
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
        // 1. Initialize project structure and write configuration
        myLog('Step 1: Initializing project structure', 'INFO');
        const myConfig = myInitPioProject(myBoardName);

        // 2. Write the incoming code to the main source file
        myLog('Step 2: Writing code to source file', 'INFO');
        myFs.writeFileSync(mySourceFile, myCode, 'utf8');
        myLog(`Code successfully written to: ${mySourceFile}`, 'INFO');
        
        // Show first few lines of code
        const myCodePreview = myCode.split('\n').slice(0, 3).join('\n');
        myLog(`Code preview:\n${myCodePreview}...`, 'INFO');
        
        // 3. Execute the PlatformIO CLI command
        myLog('Step 3: Executing PlatformIO compilation and upload', 'INFO');
        const myCommand = `pio run -d "${myProjectDir}" --target upload`;
        myLog(`Running command: ${myCommand}`, 'INFO');
        
        // Use await to run the command asynchronously and capture output
        const myStartTime = Date.now();
        const { myStdout, myStderr } = await new Promise((resolve, reject) => {
            myExec(myCommand, { maxBuffer: 1024 * 500 }, (myError, myStdout, myStderr) => {
                const myDuration = ((Date.now() - myStartTime) / 1000).toFixed(2);
                
                if (myError) {
                    myLog(`PlatformIO execution FAILED after ${myDuration}s`, 'ERROR');
                    myLog(`Exit code: ${myError.code}`, 'ERROR');
                    
                    if (myStdout) {
                        myLog('=== STDOUT ===', 'ERROR');
                        myLog(myStdout, 'ERROR');
                    }
                    if (myStderr) {
                        myLog('=== STDERR ===', 'ERROR');
                        myLog(myStderr, 'ERROR');
                    }
                    
                    return reject({ stdout: myStdout, stderr: myStderr, code: myError.code }); 
                }
                
                myLog(`PlatformIO execution completed successfully in ${myDuration}s`, 'SUCCESS');
                resolve({ myStdout, myStderr });
            });
        });

        // 4. Send success response back to the Chrome extension
        myLog('Step 4: Sending success response to client', 'SUCCESS');
        myLog('=== REQUEST COMPLETED SUCCESSFULLY ===', 'SUCCESS');
        
        myRes.status(200).json({ 
            message: `Compilation and Upload for ${myBoardName} (${myConfig.board}) succeeded!`,
            output: myStdout.trim()
        });

    } catch (myException) {
        myLog('=== REQUEST FAILED ===', 'ERROR');
        
        // Handle rejection from the Promise (failed compilation/upload)
        const myErrorOutput = myException.stderr || myException.stdout || myException.toString();
        
        myLog('Sending error response to client', 'ERROR');
        
        // Send failure message and debug info back to the Chrome extension
        myRes.status(500).json({ 
            message: 'Compilation or Upload failed. Check the error details below.', 
            error: myErrorOutput.trim()
        });
    }
});

// Health check endpoint
myApp.get('/health', (myReq, myRes) => {
    myLog('Health check request received', 'INFO');
    myRes.json({ 
        status: 'running',
        timestamp: new Date().toISOString(),
        projectDir: myProjectDir
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
            <li>GET /health - Health check</li>
        </ul>
        <p>Project Directory: <code>${myProjectDir}</code></p>
    `);
});

// Start the server
myApp.listen(myPort, () => {
    myLog('='.repeat(60), 'INFO');
    myLog('✨ PlatformIO Bridge Server is RUNNING', 'SUCCESS');
    myLog(`Server URL: http://localhost:${myPort}`, 'SUCCESS');
    myLog(`Project Directory: ${myProjectDir}`, 'INFO');
    myLog('='.repeat(60), 'INFO');
    myLog('Ensure PlatformIO Core (CLI) is installed and in your PATH', 'WARN');
    myLog('To test: Open http://localhost:8080 in your browser', 'INFO');
    myLog('Press Ctrl+C to stop the server', 'INFO');
});
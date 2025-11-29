const myExpress = require('express');
// body-parser is no longer needed/required
const { exec: myExec } = require('child_process');
const myFs = require('fs');
const myPath = require('path');

// Use my descriptive, camelCase variable names
const myApp = myExpress();
const myPort = 8080;
const myProjectDir = myPath.join(__dirname, 'myPioProject');
const mySourceFile = myPath.join(myProjectDir, 'src', 'main.cpp');

// --- Configuration and Setup ---

// 🎯 REPLACED: myApp.use(myBodyParser.json());
// Use built-in Express middleware to parse incoming JSON request bodies
myApp.use(myExpress.json());

// Set up CORS to allow the Chrome extension to connect
myApp.use((myReq, myRes, myNext) => {
    // Allows any Chrome extension to connect. For a student environment, this is fine.
    myRes.setHeader('Access-Control-Allow-Origin', '*'); 
    myRes.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    myRes.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    myNext();
});

// --- Helper Functions ---

/**
 * Maps simple board names to PlatformIO's required settings.
 * This is crucial for cross-platform compatibility.
 */
function myGetPioConfig(myBoardId) {
    // PlatformIO board IDs and platforms for common boards
    switch (myBoardId) {
        case 'nano33ble':
            // Use 'nano33ble' ID and 'nordicnrf52' platform
            return { platform: 'nordicnrf52', board: 'nano33ble' };
        case 'uno':
            return { platform: 'atmelavr', board: 'uno' };
        case 'nano':
            return { platform: 'atmelavr', board: 'nanoatmega328' };
        default:
            return { platform: 'atmelavr', board: 'uno' }; // Default fallback
    }
}

/**
 * Initializes a new PlatformIO project structure and writes the platformio.ini file.
 */
function myInitPioProject(myBoardId) {
    const myConfig = myGetPioConfig(myBoardId);
    
    // Create directories if they don't exist (synchronous for setup phase)
    myFs.mkdirSync(myPath.join(myProjectDir, 'src'), { recursive: true });
    
    // Write the dynamic platformio.ini file
    const myIniContent = 
`[env:${myConfig.board}]
platform = ${myConfig.platform}
board = ${myConfig.board}
framework = arduino
`;
    myFs.writeFileSync(myPath.join(myProjectDir, 'platformio.ini'), myIniContent);
    
    console.log(`PlatformIO project configured for board: ${myBoardId} (${myConfig.board})`);
}

// --- Route Handler ---

// The main POST endpoint to receive and process the code
myApp.post('/compile-flash', async (myReq, myRes) => {
    // Destructure payload, default board to 'uno' if not provided
    // myReq.body is available here thanks to myApp.use(myExpress.json());
    const { code: myCode, board: myBoardName = 'uno' } = myReq.body; 
    
    if (!myCode) {
        return myRes.status(400).json({ message: 'Missing Arduino code.', error: 'Code field is empty.' });
    }

    try {
        // 1. Initialize project structure and write configuration
        myInitPioProject(myBoardName);

        // 2. Write the incoming code to the main source file
        myFs.writeFileSync(mySourceFile, myCode, 'utf8');
        console.log(`Code written to ${mySourceFile}`);
        
        // 3. Execute the PlatformIO CLI command
        const myCommand = `pio run -d ${myProjectDir} --target upload`;
        
        // Use await to run the command asynchronously and capture output
        const { myStdout, myStderr } = await new Promise((resolve, reject) => {
            myExec(myCommand, { maxBuffer: 1024 * 500 }, (myError, myStdout, myStderr) => {
                if (myError) {
                    // Command failed (non-zero exit code). Reject with the detailed error output.
                    console.error(`PlatformIO Execution Failed. STDOUT:\n${myStdout}\nSTDERR:\n${myStderr}`);
                    // Return both stdout and stderr for full debug context
                    return reject({ stdout: myStdout, stderr: myStderr }); 
                }
                // Command succeeded (exit code 0).
                resolve({ myStdout, myStderr });
            });
        });

        // 4. Send success response back to the Chrome extension
        myRes.status(200).json({ 
            message: `Compilation and Upload for ${myBoardName} succeeded.`,
            output: `PlatformIO Output:\n${myStdout.trim()}`
        });

    } catch (myException) {
        // Handle rejection from the Promise (failed compilation/upload)
        const myFullError = myException.stderr || myException.toString();
        
        // Send failure message and debug info back to the Chrome extension
        myRes.status(500).json({ 
            message: 'Compilation or Upload failed. See DEBUG INFO for details.', 
            // Return only the relevant stderr output for cleaner debugging
            error: myFullError.trim()
        });
    }
});


// Start the server
myApp.listen(myPort, () => {
    console.log(`✨ PlatformIO Bridge Server running at http://localhost:${myPort}`);
    console.log('Ensure PlatformIO Core (CLI) is installed and available in your PATH.');
    console.log('Press Ctrl+C to stop the server.');
});
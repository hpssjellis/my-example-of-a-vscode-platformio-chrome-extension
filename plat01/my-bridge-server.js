// myBridgeServer.js


/*


mkdir my-pio-bridge
cd my-pio-bridge
npm init -y
npm install express body-parser
*/




const myExpress = require('express');
const myBodyParser = require('body-parser');
const { myExec } = require('child_process');
const myFs = require('fs');
const myPath = require('path');

// Use my descriptive, camelCase variable names
const myApp = myExpress();
const myPort = 8080;
const myProjectDir = myPath.join(__dirname, 'myPioProject');
const mySourceFile = myPath.join(myProjectDir, 'src', 'main.cpp');

// --- Configuration and Setup ---
myApp.use(myBodyParser.json());

// Set up CORS to allow the Chrome extension to connect
myApp.use((myReq, myRes, myNext) => {
    myRes.setHeader('Access-Control-Allow-Origin', 'chrome-extension://*'); // Use the actual extension ID in a real scenario
    myRes.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    myRes.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    myNext();
});

/**
 * Initializes a new PlatformIO project structure if it doesn't exist.
 * This ensures the project directory and src folder are ready.
 */
function myInitPioProject(myBoard) {
    if (!myFs.existsSync(myProjectDir)) {
        // Use synchronous functions for setup
        myFs.mkdirSync(myPath.join(myProjectDir, 'src'), { recursive: true });
        
        // Write a simple platformio.ini for the UNO board
        const myIniContent = 
`[env:uno]
platform = atmelavr
board = ${myBoard}
framework = arduino
`;
        myFs.writeFileSync(myPath.join(myProjectDir, 'platformio.ini'), myIniContent);
        
        console.log(`PlatformIO project initialized for board: ${myBoard}`);
    }
}

// --- Route Handlers (async/await preferred) ---

// The main POST endpoint to receive and process the code
myApp.post('/compile-flash', async (myReq, myRes) => {
    const { code: myCode, board: myBoardName = 'uno' } = myReq.body; // Default to 'uno'
    
    if (!myCode) {
        return myRes.status(400).json({ error: 'Missing Arduino code in the request body.' });
    }

    try {
        // 1. Initialize project structure
        myInitPioProject(myBoardName);

        // 2. Write the incoming code to the main source file
        myFs.writeFileSync(mySourceFile, myCode, 'utf8');
        console.log('Code written to main.cpp');
        
        // 3. Execute the PlatformIO CLI command
        const myCommand = `pio run -d ${myProjectDir} --target upload`;
        
        // Use await to run the command asynchronously
        await new Promise((resolve, reject) => {
            // exec() is simple for single commands
            myExec(myCommand, (myError, myStdout, myStderr) => {
                if (myError) {
                    console.error(`PlatformIO Error: ${myStderr}`);
                    // Return only the error message to the browser
                    return reject(myStderr); 
                }
                console.log(`PlatformIO Output: ${myStdout}`);
                resolve(myStdout);
            });
        });

        // 4. Send success response back to the Chrome extension
        myRes.status(200).json({ 
            message: `PlatformIO Build and Upload for ${myBoardName} succeeded.`,
            output: 'Check console for full PIO output.'
        });

    } catch (myException) {
        // Handle all errors (file writing, PIO execution)
        myRes.status(500).json({ 
            message: 'Compile/Flash failed.', 
            error: myException.toString().trim()
        });
    }
});


// Start the server
myApp.listen(myPort, () => {
    console.log(`✨ PlatformIO Bridge Server running at http://localhost:${myPort}`);
    console.log('Press Ctrl+C to stop the server.');
});

// mySidePanel.js - Chrome Extension Script for PlatformIO Bridge

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    myInitialize();
});

// Descriptive, camelCase variables for elements
let myCodeElement;
let myBoardElement;
let myStatusElement;
let myCompileButton;
let myClearLogsButton;
let myClearSerialButton;
let mySerialConsole;

// The URL for the local server bridge
const myLocalServerUrl = "http://localhost:8080/compile-flash";
const mySerialStreamUrl = "http://localhost:8080/serial-stream";

// Log arrays
let myLogMessages = [];
let mySerialMessages = [];

// EventSource for serial streaming
let mySerialEventSource = null;

// Initialize the application
function myInitialize() {
    console.log('[INIT] Initializing side panel...');
    
    // Get DOM elements
    myCodeElement = document.getElementById("myArduinoCode");
    myBoardElement = document.getElementById("myBoardSelector");
    myStatusElement = document.getElementById("myStatusMessage");
    myCompileButton = document.getElementById("myCompileButton");
    myClearLogsButton = document.getElementById("myClearLogsButton");
    myClearSerialButton = document.getElementById("myClearSerialButton");
    mySerialConsole = document.getElementById("mySerialConsole");
    
    // Verify all elements exist
    if (!myCodeElement || !myBoardElement || !myStatusElement || !myCompileButton || !mySerialConsole) {
        console.error('[INIT] ERROR: Could not find required DOM elements');
        return;
    }
    
    console.log('[INIT] All DOM elements found');
    
    // Attach event listeners
    myCompileButton.addEventListener('click', mySendCodeToPlatformIO);
    myClearLogsButton.addEventListener('click', myClearLogs);
    myClearSerialButton.addEventListener('click', myClearSerial);
    console.log('[INIT] Event listeners attached');
    
    // Load example code
    myCodeElement.value = `void setup() {
  Serial.begin(9600);
  pinMode(LED_BUILTIN, OUTPUT);
}
void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(100);
  digitalWrite(LED_BUILTIN, LOW);
  delay(100);
  Serial.println("Flashing...");
}`;

    myAddLog("Example code loaded", "info");
    myAddLog("Select a board and click 'Compile & Flash' to begin", "info");
    console.log('[INIT] Initialization complete');
    
    // Start serial stream connection
    myConnectSerialStream();
}

// Connect to serial stream (Server-Sent Events)
function myConnectSerialStream() {
    console.log('[SERIAL] Connecting to serial stream...');
    myAddLog("Connecting to serial stream...", "info");
    
    try {
        mySerialEventSource = new EventSource(mySerialStreamUrl);
        
        mySerialEventSource.onopen = function() {
            console.log('[SERIAL] Stream connected');
            myAddLog("Serial stream connected", "success");
        };
        
        mySerialEventSource.onmessage = function(event) {
            try {
                const myData = JSON.parse(event.data);
                
                if (myData.type === 'serial') {
                    console.log(`[SERIAL DATA] ${myData.message}`);
                    myAddSerialLine(myData.message);
                } else if (myData.type === 'connected') {
                    console.log('[SERIAL] Connection confirmed');
                    myAddSerialLine(`=== ${myData.message} ===`);
                }
            } catch (error) {
                console.error('[SERIAL] Error parsing message:', error);
            }
        };
        
        mySerialEventSource.onerror = function(error) {
            console.error('[SERIAL] Stream error:', error);
            myAddLog("Serial stream disconnected - will retry", "warning");
            
            // EventSource automatically reconnects, but we'll log it
            if (mySerialEventSource.readyState === EventSource.CLOSED) {
                myAddLog("Serial stream closed", "error");
            }
        };
        
    } catch (error) {
        console.error('[SERIAL] Failed to connect:', error);
        myAddLog("Failed to connect to serial stream", "error");
    }
}

// Add line to serial console
function myAddSerialLine(myMessage) {
    const myTimestamp = new Date().toLocaleTimeString();
    const myLine = `[${myTimestamp}] ${myMessage}`;
    
    mySerialMessages.push(myLine);
    
    // Keep only last 500 lines to prevent memory issues
    if (mySerialMessages.length > 500) {
        mySerialMessages.shift();
    }
    
    myRenderSerial();
}

// Render serial console
function myRenderSerial() {
    if (!mySerialConsole) return;
    
    mySerialConsole.innerHTML = mySerialMessages
        .map(line => `<div class="serial-line">${line}</div>`)
        .join('');
    mySerialConsole.scrollTop = mySerialConsole.scrollHeight;
}

// Clear serial console
function myClearSerial() {
    console.log('[SERIAL] Clearing serial console');
    mySerialMessages = [];
    mySerialConsole.innerHTML = 'Serial console cleared. Waiting for data...';
    myAddLog("Serial console cleared", "info");
}

// Helper function to add log entries
function myAddLog(myMessage, myType = "info") {
    const myTimestamp = new Date().toLocaleTimeString();
    const myLogEntry = `[${myTimestamp}] ${myMessage}`;
    myLogMessages.push({ message: myLogEntry, type: myType });
    
    console.log(`[${myType.toUpperCase()}] ${myMessage}`);
    myRenderLogs();
}

// Render all logs to the status element
function myRenderLogs() {
    if (!myStatusElement) return;
    
    myStatusElement.innerHTML = myLogMessages
        .map(log => `<div class="log-entry log-${log.type}">${log.message}</div>`)
        .join('');
    myStatusElement.scrollTop = myStatusElement.scrollHeight;
}

// Clear logs
function myClearLogs() {
    console.log('[LOGS] Clearing status logs');
    myLogMessages = [];
    myAddLog("Logs cleared", "info");
}

// The main function for sending the code
async function mySendCodeToPlatformIO() {
    console.log('[MAIN] Compile & Flash button clicked');
    
    const myCode = myCodeElement.value;
    const myBoard = myBoardElement.value;
    
    myAddLog("=== COMPILE & FLASH STARTED ===", "info");
    myAddLog(`Selected board: ${myBoard}`, "info");
    myAddLog(`Code length: ${myCode.length} characters`, "info");
    
    if (!myCode.trim()) {
        myAddLog("ERROR: No code provided", "error");
        console.error('[MAIN] No code to compile');
        return;
    }

    // Disable button during processing
    myCompileButton.disabled = true;
    myCompileButton.textContent = "Processing...";
    console.log('[MAIN] Button disabled, starting request');

    myAddLog(`Connecting to server at ${myLocalServerUrl}...`, "info");

    try {
        // Send data to the local bridge server
        myAddLog("Sending POST request with code and board selection...", "info");
        console.log(`[FETCH] Sending request to ${myLocalServerUrl}`);
        console.log(`[FETCH] Board: ${myBoard}, Code length: ${myCode.length}`);
        
        const myResponse = await fetch(myLocalServerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code: myCode, board: myBoard }) 
        });

        console.log(`[FETCH] Response received: ${myResponse.status} ${myResponse.statusText}`);
        myAddLog(`Server responded with status: ${myResponse.status} ${myResponse.statusText}`, 
            myResponse.ok ? "success" : "warning");

        if (myResponse.ok) {
            const myResult = await myResponse.json();
            console.log('[FETCH] Success response:', myResult);
            
            myAddLog("SUCCESS: Compilation and upload completed!", "success");
            myAddLog(myResult.message, "success");
            
            if (myResult.serialMonitor) {
                myAddLog(`Serial monitor: ${myResult.serialMonitor}`, "info");
                myAddSerialLine("=== NEW UPLOAD - SERIAL MONITOR STARTED ===");
            }
            
            if (myResult.output) {
                myAddLog("=== SERVER OUTPUT ===", "info");
                myAddLog(myResult.output, "info");
            }
        } else {
            const myResult = await myResponse.json();
            console.error('[FETCH] Error response:', myResult);
            
            myAddLog("FAILURE: Server returned an error", "error");
            myAddLog(myResult.message, "error");
            
            if (myResult.error) {
                myAddLog("=== ERROR DETAILS ===", "error");
                myAddLog(myResult.error, "error");
            }
        }
    } catch (myError) {
        console.error('[FETCH] Connection error:', myError);
        
        myAddLog("CONNECTION ERROR: Cannot reach local bridge server", "error");
        myAddLog(`Is the server running at ${myLocalServerUrl}?`, "error");
        myAddLog(`Error details: ${myError.message}`, "error");
        myAddLog("Make sure to run: node my-bridge-server.js", "warning");
    } finally {
        // Re-enable button
        myCompileButton.disabled = false;
        myCompileButton.textContent = "Compile & Flash";
        myAddLog("=== OPERATION COMPLETED ===", "info");
        console.log('[MAIN] Operation completed, button re-enabled');
    }
}
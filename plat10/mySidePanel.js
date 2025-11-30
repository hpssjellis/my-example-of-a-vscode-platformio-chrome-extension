/*
===============================================================================
INSTALLATION INSTRUCTIONS
===============================================================================

1. THIS FILE:
   Save as: mySidePanel.js
   Place in same directory as mySidePanel.html

2. REFERENCED BY:
   mySidePanel.html includes this via: <script src="mySidePanel.js"></script>

3. DEPENDENCIES:
   - Requires bridge server running at http://localhost:8080
   - Server must have both Arduino and TFLite endpoints active

4. FEATURES:
   - Tab switching between Arduino and TFLite tools
   - Arduino code compilation and upload
   - Serial monitor streaming
   - TensorFlow.js to TFLite model conversion
   - File upload with drag-and-drop

===============================================================================
*/

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    myInitialize();
});

// DOM Elements - Arduino
let myCodeElement;
let myBoardElement;
let myStatusElement;
let myCompileButton;
let myClearLogsButton;
let myClearSerialButton;
let mySerialConsole;

// DOM Elements - TFLite
let myModelNameInput;
let myModelFolderPath;
let myModelInfo;
let myModelFolderDisplay;
let myModelValidationStatus;
let myValidateButton;
let myConvertButton;
let myDownloadButton;
let myClearTFLiteButton;
let myTFLiteOutput;

// DOM Elements - Tabs
let myTabButtons;
let myArduinoPanel;
let myTFLitePanel;

// Server URLs
const myLocalServerUrl = "http://localhost:8080/compile-flash";
const mySerialStreamUrl = "http://localhost:8080/serial-stream";
const myTFLiteValidateUrl = "http://localhost:8080/validate-model-path";
const myTFLiteConvertUrl = "http://localhost:8080/convert-tfjs-to-tflite";

// State
let myLogMessages = [];
let mySerialMessages = [];
let myTFLiteMessages = [];
let mySerialEventSource = null;
let myValidatedModelPath = null;
let myConvertedTFLite = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

function myInitialize() {
    console.log('[INIT] Initializing side panel...');
    
    // Get all DOM elements
    myGetDOMElements();
    
    // Verify critical elements exist
    if (!myCodeElement || !mySerialConsole || !myModelFileInput) {
        console.error('[INIT] ERROR: Could not find required DOM elements');
        return;
    }
    
    console.log('[INIT] All DOM elements found');
    
    // Attach event listeners
    myAttachEventListeners();
    
    // Load example Arduino code
    myLoadExampleCode();
    
    // Initialize logging
    myAddLog("System initialized and ready", "info");
    myAddTFLiteLog("Enter the folder path and click 'Validate Path' to check the model", "info");
    
    // Start serial stream connection
    myConnectSerialStream();
    
    console.log('[INIT] Initialization complete');
}

function myGetDOMElements() {
    // Arduino elements
    myCodeElement = document.getElementById("myArduinoCode");
    myBoardElement = document.getElementById("myBoardSelector");
    myStatusElement = document.getElementById("myStatusMessage");
    myCompileButton = document.getElementById("myCompileButton");
    myClearLogsButton = document.getElementById("myClearLogsButton");
    myClearSerialButton = document.getElementById("myClearSerialButton");
    mySerialConsole = document.getElementById("mySerialConsole");
    
    // TFLite elements
    myModelNameInput = document.getElementById("myModelName");
    myModelFolderPath = document.getElementById("myModelFolderPath");
    myModelInfo = document.getElementById("myModelInfo");
    myModelFolderDisplay = document.getElementById("myModelFolderDisplay");
    myModelValidationStatus = document.getElementById("myModelValidationStatus");
    myValidateButton = document.getElementById("myValidateButton");
    myConvertButton = document.getElementById("myConvertButton");
    myDownloadButton = document.getElementById("myDownloadButton");
    myClearTFLiteButton = document.getElementById("myClearTFLiteButton");
    myTFLiteOutput = document.getElementById("myTFLiteOutput");
    
    // Tab elements
    myTabButtons = document.querySelectorAll('.tab-button');
    myArduinoPanel = document.getElementById('arduinoPanel');
    myTFLitePanel = document.getElementById('tflitePanel');
}

function myAttachEventListeners() {
    console.log('[INIT] Attaching event listeners...');
    
    // Tab switching
    myTabButtons.forEach(button => {
        button.addEventListener('click', () => mySwitchTab(button.dataset.tab));
    });
    
    // Arduino listeners
    myCompileButton.addEventListener('click', mySendCodeToPlatformIO);
    myClearLogsButton.addEventListener('click', myClearLogs);
    myClearSerialButton.addEventListener('click', myClearSerial);
    
    // TFLite listeners
    myValidateButton.addEventListener('click', myValidateModelPath);
    myConvertButton.addEventListener('click', myConvertToTFLite);
    myDownloadButton.addEventListener('click', myDownloadTFLite);
    myClearTFLiteButton.addEventListener('click', myClearTFLiteOutput);
    
    console.log('[INIT] Event listeners attached');
}

function myLoadExampleCode() {
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
}

// ============================================================================
// TAB SWITCHING
// ============================================================================

function mySwitchTab(myTabName) {
    console.log(`[TAB] Switching to: ${myTabName}`);
    
    // Update buttons
    myTabButtons.forEach(button => {
        if (button.dataset.tab === myTabName) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
    
    // Update panels
    if (myTabName === 'arduino') {
        myArduinoPanel.classList.add('active');
        myTFLitePanel.classList.remove('active');
    } else if (myTabName === 'tflite') {
        myArduinoPanel.classList.remove('active');
        myTFLitePanel.classList.add('active');
    }
}

// ============================================================================
// ARDUINO FUNCTIONALITY
// ============================================================================

async function mySendCodeToPlatformIO() {
    console.log('[ARDUINO] Compile & Flash button clicked');
    
    const myCode = myCodeElement.value;
    const myBoard = myBoardElement.value;
    
    myAddLog("=== COMPILE & FLASH STARTED ===", "info");
    myAddLog(`Selected board: ${myBoard}`, "info");
    myAddLog(`Code length: ${myCode.length} characters`, "info");
    
    if (!myCode.trim()) {
        myAddLog("ERROR: No code provided", "error");
        console.error('[ARDUINO] No code to compile');
        return;
    }

    myCompileButton.disabled = true;
    myCompileButton.textContent = "Processing...";
    console.log('[ARDUINO] Button disabled, starting request');

    myAddLog(`Connecting to server at ${myLocalServerUrl}...`, "info");

    try {
        myAddLog("Sending POST request with code and board selection...", "info");
        console.log(`[ARDUINO] Sending request to ${myLocalServerUrl}`);
        
        const myResponse = await fetch(myLocalServerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: myCode, board: myBoard }) 
        });

        console.log(`[ARDUINO] Response: ${myResponse.status} ${myResponse.statusText}`);
        myAddLog(`Server responded: ${myResponse.status} ${myResponse.statusText}`, 
            myResponse.ok ? "success" : "warning");

        if (myResponse.ok) {
            const myResult = await myResponse.json();
            console.log('[ARDUINO] Success:', myResult);
            
            myAddLog("SUCCESS: Compilation and upload completed!", "success");
            myAddLog(myResult.message, "success");
            
            if (myResult.serialMonitor) {
                myAddLog(`Serial monitor: ${myResult.serialMonitor}`, "info");
                myAddSerialLine("=== NEW UPLOAD - SERIAL MONITOR STARTED ===");
            }
            
            if (myResult.output) {
                myAddLog("=== BUILD OUTPUT ===", "info");
                myAddLog(myResult.output.substring(0, 500), "info");
            }
        } else {
            const myResult = await myResponse.json();
            console.error('[ARDUINO] Error:', myResult);
            
            myAddLog("FAILURE: Server returned an error", "error");
            myAddLog(myResult.message, "error");
            
            if (myResult.error) {
                myAddLog("=== ERROR DETAILS ===", "error");
                myAddLog(myResult.error, "error");
            }
        }
    } catch (myError) {
        console.error('[ARDUINO] Connection error:', myError);
        
        myAddLog("CONNECTION ERROR: Cannot reach bridge server", "error");
        myAddLog(`Is the server running at ${myLocalServerUrl}?`, "error");
        myAddLog(`Error: ${myError.message}`, "error");
    } finally {
        myCompileButton.disabled = false;
        myCompileButton.textContent = "Compile & Flash";
        myAddLog("=== OPERATION COMPLETED ===", "info");
        console.log('[ARDUINO] Operation completed');
    }
}

// Serial Monitor
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
        };
        
    } catch (error) {
        console.error('[SERIAL] Failed to connect:', error);
        myAddLog("Failed to connect to serial stream", "error");
    }
}

function myAddSerialLine(myMessage) {
    const myTimestamp = new Date().toLocaleTimeString();
    const myLine = `[${myTimestamp}] ${myMessage}`;
    
    mySerialMessages.push(myLine);
    
    if (mySerialMessages.length > 500) {
        mySerialMessages.shift();
    }
    
    myRenderSerial();
}

function myRenderSerial() {
    if (!mySerialConsole) return;
    
    mySerialConsole.innerHTML = mySerialMessages
        .map(line => `<div class="serial-line">${line}</div>`)
        .join('');
    mySerialConsole.scrollTop = mySerialConsole.scrollHeight;
}

function myClearSerial() {
    console.log('[SERIAL] Clearing console');
    mySerialMessages = [];
    mySerialConsole.innerHTML = 'Serial console cleared. Waiting for data...';
    myAddLog("Serial console cleared", "info");
}

// Arduino Logging
function myAddLog(myMessage, myType = "info") {
    const myTimestamp = new Date().toLocaleTimeString();
    const myLogEntry = `[${myTimestamp}] ${myMessage}`;
    myLogMessages.push({ message: myLogEntry, type: myType });
    
    console.log(`[${myType.toUpperCase()}] ${myMessage}`);
    myRenderLogs();
}

function myRenderLogs() {
    if (!myStatusElement) return;
    
    myStatusElement.innerHTML = myLogMessages
        .map(log => `<div class="log-entry log-${log.type}">${log.message}</div>`)
        .join('');
    myStatusElement.scrollTop = myStatusElement.scrollHeight;
}

function myClearLogs() {
    console.log('[ARDUINO] Clearing logs');
    myLogMessages = [];
    myAddLog("Logs cleared", "info");
}

// ============================================================================
// TFLITE FUNCTIONALITY
// ============================================================================

// Validate Model Path
async function myValidateModelPath() {
    console.log('[TFLITE] Validate button clicked');
    
    const myFolderPath = myModelFolderPath.value.trim();
    
    if (!myFolderPath) {
        myAddTFLiteLog("ERROR: Please enter a folder path", "error");
        return;
    }
    
    myAddTFLiteLog("=== VALIDATING MODEL PATH ===", "info");
    myAddTFLiteLog(`Path: ${myFolderPath}`, "info");
    
    myValidateButton.disabled = true;
    myValidateButton.textContent = "Validating...";
    
    try {
        myAddTFLiteLog("Sending validation request to server...", "info");
        console.log('[TFLITE] Validating path:', myFolderPath);
        
        const myResponse = await fetch(myTFLiteValidateUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderPath: myFolderPath })
        });
        
        console.log(`[TFLITE] Validation response: ${myResponse.status}`);
        
        if (myResponse.ok) {
            const myResult = await myResponse.json();
            console.log('[TFLITE] Validation successful:', myResult);
            
            myAddTFLiteLog("✓ Path validation successful!", "success");
            myAddTFLiteLog(`Found model.json`, "success");
            
            if (myResult.weightFiles && myResult.weightFiles.length > 0) {
                myAddTFLiteLog(`Found ${myResult.weightFiles.length} weight file(s):`, "success");
                myResult.weightFiles.forEach(file => {
                    myAddTFLiteLog(`  ✓ ${file}`, "success");
                });
            }
            
            // Store validated path
            myValidatedModelPath = myFolderPath;
            
            // Update UI
            myModelFolderDisplay.textContent = myFolderPath;
            myModelValidationStatus.textContent = "✓ Valid";
            myModelValidationStatus.style.color = "green";
            myModelInfo.style.display = 'block';
            myConvertButton.disabled = false;
            
            myAddTFLiteLog("Model is ready for conversion", "success");
            
        } else {
            const myResult = await myResponse.json();
            console.error('[TFLITE] Validation failed:', myResult);
            
            myAddTFLiteLog("✗ Path validation failed", "error");
            myAddTFLiteLog(myResult.message || "Invalid path", "error");
            
            if (myResult.error) {
                myAddTFLiteLog(`Details: ${myResult.error}`, "error");
            }
            
            myModelInfo.style.display = 'none';
            myConvertButton.disabled = true;
            myValidatedModelPath = null;
        }
        
    } catch (error) {
        console.error('[TFLITE] Connection error:', error);
        myAddTFLiteLog("CONNECTION ERROR: Cannot reach bridge server", "error");
        myAddTFLiteLog(`Error: ${error.message}`, "error");
        myConvertButton.disabled = true;
        myValidatedModelPath = null;
    } finally {
        myValidateButton.disabled = false;
        myValidateButton.textContent = "Validate Path";
        myAddTFLiteLog("=== VALIDATION COMPLETED ===", "info");
    }
}

// Convert to TFLite
async function myConvertToTFLite() {
    console.log('[TFLITE] Convert button clicked');
    
    if (!myValidatedModelPath) {
        myAddTFLiteLog("ERROR: Please validate the model path first", "error");
        return;
    }
    
    const myModelName = myModelNameInput.value.trim() || 'model';
    
    myAddTFLiteLog("=== TFLITE CONVERSION STARTED ===", "info");
    myAddTFLiteLog(`Model name: ${myModelName}`, "info");
    myAddTFLiteLog(`Folder path: ${myValidatedModelPath}`, "info");
    
    myConvertButton.disabled = true;
    myConvertButton.textContent = "Converting...";
    
    try {
        myAddTFLiteLog("Sending conversion request to server...", "info");
        console.log('[TFLITE] Sending conversion request');
        
        const myResponse = await fetch(myTFLiteConvertUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folderPath: myValidatedModelPath,
                modelName: myModelName
            })
        });
        
        console.log(`[TFLITE] Response: ${myResponse.status}`);
        myAddTFLiteLog(`Server responded: ${myResponse.status} ${myResponse.statusText}`, 
            myResponse.ok ? "success" : "warning");
        
        if (myResponse.ok) {
            const myResult = await myResponse.json();
            console.log('[TFLITE] Conversion successful');
            
            myConvertedTFLite = {
                data: myResult.tfliteData,
                fileName: myResult.fileName,
                sizeKB: myResult.sizeKB
            };
            
            myAddTFLiteLog("SUCCESS: Model converted to TFLite!", "success");
            myAddTFLiteLog(`Output file: ${myResult.fileName}`, "success");
            myAddTFLiteLog(`Output size: ${myResult.sizeKB} KB`, "info");
            
            if (myResult.output) {
                myAddTFLiteLog("=== CONVERSION OUTPUT ===", "info");
                myAddTFLiteLog(myResult.output, "info");
            }
            
            myDownloadButton.style.display = 'inline-block';
            myAddTFLiteLog("Click 'Download .tflite' to save the file", "info");
            
        } else {
            const myResult = await myResponse.json();
            console.error('[TFLITE] Conversion failed:', myResult);
            
            myAddTFLiteLog("FAILURE: Conversion failed", "error");
            myAddTFLiteLog(myResult.message, "error");
            
            if (myResult.error) {
                myAddTFLiteLog("=== ERROR DETAILS ===", "error");
                myAddTFLiteLog(myResult.error, "error");
            }
        }
        
    } catch (error) {
        console.error('[TFLITE] Connection error:', error);
        myAddTFLiteLog("CONNECTION ERROR: Cannot reach bridge server", "error");
        myAddTFLiteLog(`Error: ${error.message}`, "error");
    } finally {
        myConvertButton.disabled = false;
        myConvertButton.textContent = "Convert to TFLite";
        myAddTFLiteLog("=== OPERATION COMPLETED ===", "info");
    }
}

// Download TFLite
function myDownloadTFLite() {
    if (!myConvertedTFLite) {
        myAddTFLiteLog("ERROR: No converted model available", "error");
        return;
    }
    
    console.log('[TFLITE] Downloading file:', myConvertedTFLite.fileName);
    myAddTFLiteLog(`Downloading ${myConvertedTFLite.fileName}...`, "info");
    
    try {
        // Convert base64 to blob
        const myBinaryString = atob(myConvertedTFLite.data);
        const myBytes = new Uint8Array(myBinaryString.length);
        for (let i = 0; i < myBinaryString.length; i++) {
            myBytes[i] = myBinaryString.charCodeAt(i);
        }
        const myBlob = new Blob([myBytes], { type: 'application/octet-stream' });
        
        // Create download link
        const myUrl = URL.createObjectURL(myBlob);
        const myLink = document.createElement('a');
        myLink.href = myUrl;
        myLink.download = myConvertedTFLite.fileName;
        myLink.click();
        
        URL.revokeObjectURL(myUrl);
        
        myAddTFLiteLog("Download started successfully", "success");
        console.log('[TFLITE] Download initiated');
        
    } catch (error) {
        console.error('[TFLITE] Download error:', error);
        myAddTFLiteLog(`ERROR: Download failed - ${error.message}`, "error");
    }
}

// TFLite Logging
function myAddTFLiteLog(myMessage, myType = "info") {
    const myTimestamp = new Date().toLocaleTimeString();
    const myLogEntry = `[${myTimestamp}] ${myMessage}`;
    myTFLiteMessages.push({ message: myLogEntry, type: myType });
    
    console.log(`[TFLITE ${myType.toUpperCase()}] ${myMessage}`);
    myRenderTFLiteLogs();
}

function myRenderTFLiteLogs() {
    if (!myTFLiteOutput) return;
    
    myTFLiteOutput.innerHTML = myTFLiteMessages
        .map(log => `<div class="log-entry log-${log.type}">${log.message}</div>`)
        .join('');
    myTFLiteOutput.scrollTop = myTFLiteOutput.scrollHeight;
}

function myClearTFLiteOutput() {
    console.log('[TFLITE] Clearing output');
    myTFLiteMessages = [];
    myAddTFLiteLog("Output cleared", "info");
}
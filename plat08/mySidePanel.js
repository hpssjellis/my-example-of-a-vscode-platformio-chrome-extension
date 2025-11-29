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
   - TensorFlow.js to TFLite model conversion (Multi-file support added)
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
let myFileUploadArea;
let myModelFileInput;
let myModelInfo;
let myModelFileName;
let myModelFileSize;
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
const myTFLiteConvertUrl = "http://localhost:8080/convert-tfjs-to-tflite";

// State
let myLogMessages = [];
let mySerialMessages = [];
let myTFLiteMessages = [];
let mySerialEventSource = null;
// myLoadedModel state is simplified as we now rely on myModelFileInput.files
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
    myAddTFLiteLog("Upload model.json and all .bin files to begin conversion", "info");
    
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
    myFileUploadArea = document.getElementById("myFileUploadArea");
    myModelFileInput = document.getElementById("myModelFileInput");
    myModelInfo = document.getElementById("myModelInfo");
    myModelFileName = document.getElementById("myModelFileName");
    myModelFileSize = document.getElementById("myModelFileSize");
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
    myFileUploadArea.addEventListener('click', () => myModelFileInput.click());
    // 💡 UPDATED: myHandleFileSelect now handles the file list
    myModelFileInput.addEventListener('change', myHandleFileSelect); 
    myConvertButton.addEventListener('click', myConvertToTFLite);
    myDownloadButton.addEventListener('click', myDownloadTFLite);
    myClearTFLiteButton.addEventListener('click', myClearTFLiteOutput);
    
    // Drag and drop (UPDATED to just pass the files to the input element)
    myFileUploadArea.addEventListener('dragover', myHandleDragOver);
    myFileUploadArea.addEventListener('dragleave', myHandleDragLeave);
    myFileUploadArea.addEventListener('drop', myHandleDrop);
    
    console.log('[INIT] Event listeners attached');
}

function myLoadExampleCode() {
    myCodeElement.value = `#include <Arduino.h> // Only needed by https://platformio.org/

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);   
}

void loop() {
  Serial.println("Serial print works! Here is A0 reading: " + String(analogRead(A0)) );
  digitalWrite(LED_BUILTIN, LOW);   // internal LED LOW = on for onboard LED
  delay(1000);                      // wait for a second
  digitalWrite(LED_BUILTIN, HIGH);  
  delay(3000);               
}
`;
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
// ARDUINO FUNCTIONALITY (UNCHANGED)
// ============================================================================

async function mySendCodeToPlatformIO() {
    // ... (logic remains the same) ...
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

// Serial Monitor (UNCHANGED)
function myConnectSerialStream() {
    // ... (logic remains the same) ...
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
    // ... (logic remains the same) ...
    const myTimestamp = new Date().toLocaleTimeString();
    const myLine = `[${myTimestamp}] ${myMessage}`;
    
    mySerialMessages.push(myLine);
    
    if (mySerialMessages.length > 500) {
        mySerialMessages.shift();
    }
    
    myRenderSerial();
}

function myRenderSerial() {
    // ... (logic remains the same) ...
    if (!mySerialConsole) return;
    
    mySerialConsole.innerHTML = mySerialMessages
        .map(line => `<div class="serial-line">${line}</div>`)
        .join('');
    mySerialConsole.scrollTop = mySerialConsole.scrollHeight;
}

function myClearSerial() {
    // ... (logic remains the same) ...
    console.log('[SERIAL] Clearing console');
    mySerialMessages = [];
    mySerialConsole.innerHTML = 'Serial console cleared. Waiting for data...';
    myAddLog("Serial console cleared", "info");
}

// Arduino Logging (UNCHANGED)
function myAddLog(myMessage, myType = "info") {
    // ... (logic remains the same) ...
    const myTimestamp = new Date().toLocaleTimeString();
    const myLogEntry = `[${myTimestamp}] ${myMessage}`;
    myLogMessages.push({ message: myLogEntry, type: myType });
    
    console.log(`[${myType.toUpperCase()}] ${myMessage}`);
    myRenderLogs();
}

function myRenderLogs() {
    // ... (logic remains the same) ...
    if (!myStatusElement) return;
    
    myStatusElement.innerHTML = myLogMessages
        .map(log => `<div class="log-entry log-${log.type}">${log.message}</div>`)
        .join('');
    myStatusElement.scrollTop = myStatusElement.scrollHeight;
}

function myClearLogs() {
    // ... (logic remains the same) ...
    console.log('[ARDUINO] Clearing logs');
    myLogMessages = [];
    myAddLog("Logs cleared", "info");
}

// ============================================================================
// TFLITE FUNCTIONALITY (UPDATED)
// ============================================================================

/**
 * 💡 NEW: Helper function to convert a File object to a Base64 string using async/await.
 */
function myFileToBase64(myFile) {
    return new Promise((resolve, reject) => {
        const myReader = new FileReader();
        // Read the file as a Data URL
        myReader.readAsDataURL(myFile);
        myReader.onload = () => {
            // Remove the "data:mime/type;base64," prefix from the result
            const myBase64String = myReader.result.split(',')[1];
            resolve(myBase64String);
        };
        myReader.onerror = myError => reject(myError);
    });
}

// File Upload Handlers
function myHandleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    myFileUploadArea.classList.add('dragover');
}

function myHandleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    myFileUploadArea.classList.remove('dragover');
}

// 💡 UPDATED: Handle file list from drop event and pass it to the input element.
function myHandleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    myFileUploadArea.classList.remove('dragover');
    
    const myFiles = e.dataTransfer.files;
    if (myFiles.length > 0) {
        // Set the files list on the hidden input element
        myModelFileInput.files = myFiles; 
        myProcessFileList(myFiles);
    }
}

// 💡 UPDATED: Handle file list from select event.
function myHandleFileSelect(e) {
    const myFiles = e.target.files;
    if (myFiles.length > 0) {
        myProcessFileList(myFiles);
    }
}

/**
 * 💡 NEW: Processes the list of selected files (JSON + BIN) to update the UI.
 * Does NOT read content here, content reading is done on conversion button click.
 */
function myProcessFileList(myFiles) {
    console.log(`[TFLITE] Processing ${myFiles.length} file(s)`);
    
    let myJsonFound = false;
    let myTotalSize = 0;
    
    for (const myFile of myFiles) {
        myTotalSize += myFile.size;
        if (myFile.name.toLowerCase().endsWith('.json')) {
            myJsonFound = true;
        }
    }

    if (!myJsonFound) {
        myAddTFLiteLog("ERROR: Please include the model.json file.", "error");
        myConvertButton.disabled = true;
        myModelInfo.style.display = 'none';
        return;
    }

    myAddTFLiteLog(`Loaded ${myFiles.length} files. JSON found.`, "success");
    
    // Update UI summary
    myModelFileName.textContent = `${myFiles.length} files (.json and .bin)`;
    myModelFileSize.textContent = `${(myTotalSize / 1024).toFixed(2)} KB`;
    myModelInfo.style.display = 'block';
    myConvertButton.disabled = false;
    myDownloadButton.style.display = 'none';
}


// Convert to TFLite (MAJOR UPDATE)
async function myConvertToTFLite() {
    console.log('[TFLITE] Convert button clicked');
    
    const myFiles = myModelFileInput.files;
    if (myFiles.length === 0) {
        myAddTFLiteLog("ERROR: No files selected. Please upload model.json and all .bin files.", "error");
        return;
    }
    
    const myModelName = myModelNameInput.value.trim() || 'my_converted_model';
    
    myAddTFLiteLog("=== TFLITE CONVERSION STARTED ===", "info");
    myAddTFLiteLog(`Model name: ${myModelName}`, "info");
    
    myConvertButton.disabled = true;
    myConvertButton.textContent = "Converting...";
    
    try {
        // 1. Read and encode all selected files
        const myFilesData = [];
        for (const myFile of myFiles) {
            myAddTFLiteLog(`Reading file: ${myFile.name}`, "info");
            // Use the new async helper function to convert to Base64
            const myBase64Content = await myFileToBase64(myFile); 
            
            myFilesData.push({
                fileName: myFile.name,
                fileContent: myBase64Content // Base64 string of the file content
            });
        }
        
        myAddTFLiteLog(`Sending ${myFilesData.length} file(s) to bridge server...`, "info");
        
        // 2. Prepare the payload with the array of all files
        const myBody = {
            myModelName: myModelName,
            myFilesData: myFilesData // Array of all files (json + bin shards)
        };
        
        // 3. Send the full payload
        const myResponse = await fetch(myTFLiteConvertUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(myBody)
        });
        
        console.log(`[TFLITE] Response: ${myResponse.status}`);
        myAddTFLiteLog(`Server responded: ${myResponse.status} ${myResponse.statusText}`, 
            myResponse.ok ? "success" : "warning");
        
        if (myResponse.ok) {
            const myResult = await myResponse.json();
            console.log('[TFLITE] Conversion successful');
            
            myConvertedTFLite = {
                data: myResult.myConvertedTFLite.fileContent, // Changed to match server response field
                fileName: myResult.myConvertedTFLite.fileName,
                sizeKB: myResult.myConvertedTFLite.sizeKB
            };
            
            myAddTFLiteLog("SUCCESS: Model converted to TFLite!", "success");
            myAddTFLiteLog(`Output file: ${myConvertedTFLite.fileName}`, "success");
            myAddTFLiteLog(`Output size: ${myConvertedTFLite.sizeKB} KB`, "info");
            
            if (myResult.myConversionOutput) { // Changed to match server response field
                myAddTFLiteLog("=== CONVERSION OUTPUT ===", "info");
                myAddTFLiteLog(myResult.myConversionOutput, "info");
            }
            
            myDownloadButton.style.display = 'inline-block';
            myAddTFLiteLog("Click 'Download .tflite' to save the file", "info");
            
        } else {
            const myResult = await myResponse.json();
            console.error('[TFLITE] Conversion failed:', myResult);
            
            myAddTFLiteLog("FAILURE: Conversion failed", "error");
            myAddTFLiteLog(myResult.myMessage || myResult.message, "error");
            
            if (myResult.myError || myResult.error) {
                myAddTFLiteLog("=== ERROR DETAILS ===", "error");
                myAddTFLiteLog(myResult.myError || myResult.error, "error");
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

// Download TFLite (UNCHANGED)
function myDownloadTFLite() {
    // ... (logic remains the same) ...
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

// TFLite Logging (UNCHANGED)
function myAddTFLiteLog(myMessage, myType = "info") {
    // ... (logic remains the same) ...
    const myTimestamp = new Date().toLocaleTimeString();
    const myLogEntry = `[${myTimestamp}] ${myMessage}`;
    myTFLiteMessages.push({ message: myLogEntry, type: myType });
    
    console.log(`[TFLITE ${myType.toUpperCase()}] ${myMessage}`);
    myRenderTFLiteLogs();
}

function myRenderTFLiteLogs() {
    // ... (logic remains the same) ...
    if (!myTFLiteOutput) return;
    
    myTFLiteOutput.innerHTML = myTFLiteMessages
        .map(log => `<div class="log-entry log-${log.type}">${log.message}</div>`)
        .join('');
    myTFLiteOutput.scrollTop = myTFLiteOutput.scrollHeight;
}

function myClearTFLiteOutput() {
    // ... (logic remains the same) ...
    console.log('[TFLITE] Clearing output');
    myTFLiteMessages = [];
    myAddTFLiteLog("Output cleared", "info");
}


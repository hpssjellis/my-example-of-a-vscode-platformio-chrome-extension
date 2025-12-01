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
let myFileUploadArea;
let myModelFileInput;
let myModelInfo;
let myModelFileName;
let myModelFileSize;
let myModelFileCount;
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
let myLoadedModel = null;
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
    myAddTFLiteLog("Upload a ZIP file containing model.json and weight files", "info");
    
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
    myModelFileCount = document.getElementById("myModelFileCount");
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
    myModelFileInput.addEventListener('change', myHandleFileSelect);
    myConvertButton.addEventListener('click', myConvertToTFLite);
    myDownloadButton.addEventListener('click', myDownloadTFLite);
    myClearTFLiteButton.addEventListener('click', myClearTFLiteOutput);
    
    // Drag and drop
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

function myHandleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    myFileUploadArea.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        myProcessModelFile(files[0]);
    }
}

function myHandleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        console.log('[TFLITE] File selected:', files[0].name);
        myProcessModelFile(files[0]);
    }
}

async function myProcessModelFile(file) {
    console.log('[TFLITE] Processing file:', file.name);
    myAddTFLiteLog(`Loading file: ${file.name}`, "info");
    
    if (!file.name.endsWith('.zip')) {
        myAddTFLiteLog("ERROR: Please upload a .zip file containing the model", "error");
        console.error('[TFLITE] Wrong file type:', file.name);
        return;
    }
    
    try {
        myAddTFLiteLog("Extracting ZIP file...", "info");
        
        // Check if JSZip is loaded
        if (typeof JSZip === 'undefined') {
            myAddTFLiteLog("ERROR: JSZip library not loaded. Please refresh the page.", "error");
            console.error('[TFLITE] JSZip library not found');
            return;
        }
        
        // Read and extract ZIP file
        const myZip = new JSZip();
        const myZipData = await myZip.loadAsync(file);
        
        console.log('[TFLITE] ZIP extracted, files:', Object.keys(myZipData.files));
        
        // Find model.json
        let myModelJsonFile = null;
        let myModelJsonPath = null;
        
        for (const [path, zipEntry] of Object.entries(myZipData.files)) {
            if (!zipEntry.dir && path.endsWith('model.json')) {
                myModelJsonFile = zipEntry;
                myModelJsonPath = path;
                console.log('[TFLITE] Found model.json at:', path);
                break;
            }
        }
        
        if (!myModelJsonFile) {
            myAddTFLiteLog("ERROR: No model.json found in ZIP file", "error");
            console.error('[TFLITE] model.json not found in ZIP');
            return;
        }
        
        myAddTFLiteLog(`Found model.json at: ${myModelJsonPath}`, "success");
        
        // Read model.json
        const myModelJsonContent = await myModelJsonFile.async('text');
        const myModelTopology = JSON.parse(myModelJsonContent);
        
        console.log('[TFLITE] Model.json parsed successfully');
        
        // Find all weight files
        const myWeightFiles = {};
        const myWeightFilenames = [];
        
        if (myModelTopology.weightsManifest) {
            // Extract weight filenames from manifest
            for (const manifest of myModelTopology.weightsManifest) {
                for (const weightPath of manifest.paths) {
                    myWeightFilenames.push(weightPath);
                }
            }
            
            myAddTFLiteLog(`Looking for ${myWeightFilenames.length} weight file(s)...`, "info");
            console.log('[TFLITE] Weight files needed:', myWeightFilenames);
            
            // Find weight files in ZIP
            for (const weightName of myWeightFilenames) {
                let found = false;
                
                for (const [path, zipEntry] of Object.entries(myZipData.files)) {
                    if (!zipEntry.dir && path.endsWith(weightName)) {
                        const weightData = await zipEntry.async('base64');
                        myWeightFiles[weightName] = weightData;
                        myAddTFLiteLog(`✓ Found: ${weightName}`, "success");
                        console.log('[TFLITE] Found weight file:', weightName);
                        found = true;
                        break;
                    }
                }
                
                if (!found) {
                    myAddTFLiteLog(`✗ Missing: ${weightName}`, "error");
                    console.warn('[TFLITE] Missing weight file:', weightName);
                }
            }
        } else {
            myAddTFLiteLog("No weight files specified in model.json", "info");
            console.log('[TFLITE] No weightsManifest in model.json');
        }
        
        const myFileCount = 1 + Object.keys(myWeightFiles).length;
        
        myLoadedModel = {
            modelTopology: myModelTopology,
            weightFiles: myWeightFiles,
            fileName: file.name
        };
        
        // Update UI
        myModelFileName.textContent = file.name;
        myModelFileSize.textContent = `${(file.size / 1024).toFixed(2)} KB`;
        myModelFileCount.textContent = `${myFileCount} (model.json + ${Object.keys(myWeightFiles).length} weights)`;
        myModelInfo.style.display = 'block';
        myConvertButton.disabled = false;
        
        console.log('[TFLITE] Convert button enabled');
        myAddTFLiteLog("Model package ready for conversion", "success");
        
        if (myModelTopology.config?.layers?.[0]?.config?.batch_input_shape) {
            myAddTFLiteLog(`Input shape: ${JSON.stringify(myModelTopology.config.layers[0].config.batch_input_shape)}`, "info");
        }
        
    } catch (error) {
        console.error('[TFLITE] Error processing ZIP file:', error);
        myAddTFLiteLog(`ERROR: Failed to process ZIP file - ${error.message}`, "error");
        myConvertButton.disabled = true;
    }
}

// Convert to TFLite
async function myConvertToTFLite() {
    console.log('[TFLITE] Convert button clicked');
    
    if (!myLoadedModel) {
        myAddTFLiteLog("ERROR: No model loaded", "error");
        return;
    }
    
    const myModelName = myModelNameInput.value.trim() || 'model';
    
    myAddTFLiteLog("=== TFLITE CONVERSION STARTED ===", "info");
    myAddTFLiteLog(`Model name: ${myModelName}`, "info");
    
    myConvertButton.disabled = true;
    myConvertButton.textContent = "Converting...";
    
    try {
        myAddTFLiteLog("Sending model to bridge server...", "info");
        console.log('[TFLITE] Sending conversion request');
        
        const myResponse = await fetch(myTFLiteConvertUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                modelData: myLoadedModel,
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

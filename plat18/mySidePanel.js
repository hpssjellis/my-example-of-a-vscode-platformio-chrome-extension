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
   - Manual serial connection via clickable title
   - Arduino code compilation and upload
   - Serial monitor streaming
   - Advanced platformio.ini editing
   - File browser for PlatformIO and TFLite folders
   - TensorFlow.js to Keras .h5 conversion via WSL
   - NEW: System checks for PlatformIO and TFLite dependencies

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
let mySerialConnectButton;
let myClearLogsButton;
let myClearSerialButton;
let mySerialConsole;
let mySerialStatus;
let myAdvancedButton;
let myAdvancedSection;
let myPlatformIOConfig;
let mySaveConfigButton;
let myPioFolderPath;
let myBrowsePioFolderButton;
let mySystemCheckButton; // NEW
let mySystemCheckStatus; // NEW

// DOM Elements - TFLite
let myModelNameInput;
let myTFLiteFolderPath;
let myBrowseTFLiteFolderButton;
let myModelInfo;
let myModelFolderName;
let myOutputLocation;
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
const mySerialConnectUrl = "http://localhost:8080/serial-connect";
const mySerialDisconnectUrl = "http://localhost:8080/serial-disconnect";
const myTFLiteConvertUrl = "http://localhost:8080/convert-tfjs-to-keras";
const mySelectFolderUrl = "http://localhost:8080/select-folder";
const mySaveConfigUrl = "http://localhost:8080/save-platformio-config";
// NEW: Check URLs
const myPioCheckUrl = "http://localhost:8080/check-pio-version";
const myTFLiteCheckUrl = "http://localhost:8080/check-tflite-converter";


// State
let myLogMessages = [];
let mySerialMessages = [];
let myTFLiteMessages = [];
let mySerialEventSource = null;
let mySerialConnected = false;
let myAdvancedVisible = false;
let mySelectedPioFolder = "";
let mySelectedTFLiteFolder = "";
let myConvertedModel = null;

// Default platformio.ini templates
const myPlatformIOTemplates = {
    nano33ble: `[env:nano33ble]
platform = nordicnrf52
board = nano33ble
framework = arduino
monitor_speed = 115200
`,
    uno: `[env:uno]
platform = atmelavr
board = uno
framework = arduino
monitor_speed = 9600
`,
    nano: `[env:nanoatmega328]
platform = atmelavr
board = nanoatmega328
framework = arduino
monitor_speed = 9600
`
};

// ============================================================================
// INITIALIZATION
// ============================================================================

function myInitialize() {
    console.log('[INIT] Initializing side panel...');
    
    // Get all DOM elements
    myGetDOMElements();
    
    // Verify critical elements exist
    if (!myCodeElement || !mySerialConsole || !mySerialConnectButton) {
        console.error('[INIT] ERROR: Could not find required DOM elements');
        return;
    }
    
    console.log('[INIT] All DOM elements found');
    
    // Attach event listeners
    myAttachEventListeners();
    
    // Load example Arduino code
    myLoadExampleCode();
    
    // Load default platformio.ini
    myUpdatePlatformIOConfig('uno');
    
    // Initialize logging
    myAddLog("System initialized and ready", "info");
    myAddLog("Run System Check to verify toolchain setup", "info");
    myAddTFLiteLog("Enter or browse for a folder containing model.json", "info");
    
    console.log('[INIT] Initialization complete');
}

function myGetDOMElements() {
    // Arduino elements
    myCodeElement = document.getElementById("myArduinoCode");
    myBoardElement = document.getElementById("myBoardSelector");
    myStatusElement = document.getElementById("myStatusMessage");
    myCompileButton = document.getElementById("myCompileButton");
    mySerialConnectButton = document.getElementById("mySerialConnectButton");
    myClearLogsButton = document.getElementById("myClearLogsButton");
    myClearSerialButton = document.getElementById("myClearSerialButton");
    mySerialConsole = document.getElementById("mySerialConsole");
    mySerialStatus = document.getElementById("mySerialStatus");
    myAdvancedButton = document.getElementById("myAdvancedButton");
    myAdvancedSection = document.getElementById("myAdvancedSection");
    myPlatformIOConfig = document.getElementById("myPlatformIOConfig");
    mySaveConfigButton = document.getElementById("mySaveConfigButton");
    myPioFolderPath = document.getElementById("myPioFolderPath");
    myBrowsePioFolderButton = document.getElementById("myBrowsePioFolderButton");
    // NEW: System Check Elements
    mySystemCheckButton = document.getElementById("mySystemCheckButton");
    mySystemCheckStatus = document.getElementById("mySystemCheckStatus");
    
    // TFLite elements
    myModelNameInput = document.getElementById("myModelName");
    myTFLiteFolderPath = document.getElementById("myTFLiteFolderPath");
    myBrowseTFLiteFolderButton = document.getElementById("myBrowseTFLiteFolderButton");
    myModelInfo = document.getElementById("myModelInfo");
    myModelFolderName = document.getElementById("myModelFolderName");
    myOutputLocation = document.getElementById("myOutputLocation");
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
    
    // Serial connection (manual button)
    mySerialConnectButton.addEventListener('click', myToggleSerialConnection);
    
    // Arduino listeners
    myCompileButton.addEventListener('click', mySendCodeToPlatformIO);
    myClearLogsButton.addEventListener('click', myClearLogs);
    myClearSerialButton.addEventListener('click', myClearSerial);
    myBoardElement.addEventListener('change', (e) => myUpdatePlatformIOConfig(e.target.value));
    
    // Advanced section
    myAdvancedButton.addEventListener('click', myToggleAdvancedSection);
    mySaveConfigButton.addEventListener('click', mySavePlatformIOConfig);
    
    // File browsers - button click
    myBrowsePioFolderButton.addEventListener('click', () => myBrowseFolder('pio'));
    myBrowseTFLiteFolderButton.addEventListener('click', () => myBrowseFolder('tflite'));
    
    // File path inputs - manual entry
    myPioFolderPath.addEventListener('change', myHandlePioFolderPathChange);
    myPioFolderPath.addEventListener('blur', myHandlePioFolderPathChange);
    myTFLiteFolderPath.addEventListener('change', myHandleTFLiteFolderPathChange);
    myTFLiteFolderPath.addEventListener('blur', myHandleTFLiteFolderPathChange);
    
    // TFLite listeners
    myConvertButton.addEventListener('click', myConvertToKeras);
    myDownloadButton.addEventListener('click', myDownloadKeras);
    myClearTFLiteButton.addEventListener('click', myClearTFLiteOutput);
    
    // NEW: System Check Listener
    if (mySystemCheckButton) {
        mySystemCheckButton.addEventListener('click', myRunSystemChecks);
    }
    
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
// PLATFORMIO.INI CONFIGURATION
// ============================================================================

function myUpdatePlatformIOConfig(myBoardId) {
    console.log(`[CONFIG] Updating platformio.ini for board: ${myBoardId}`);
    
    const myTemplate = myPlatformIOTemplates[myBoardId] || myPlatformIOTemplates['uno'];
    myPlatformIOConfig.value = myTemplate;
    
    myAddLog(`platformio.ini updated for ${myBoardId}`, "info");
}

function myToggleAdvancedSection() {
    myAdvancedVisible = !myAdvancedVisible;
    
    if (myAdvancedVisible) {
        myAdvancedSection.classList.add('visible');
        myAdvancedButton.textContent = 'Hide Advanced';
        myAddLog("Advanced section opened", "info");
    } else {
        myAdvancedSection.classList.remove('visible');
        myAdvancedButton.textContent = 'Advanced platformio.ini';
        myAddLog("Advanced section closed", "info");
    }
}

async function mySavePlatformIOConfig() {
    console.log('[CONFIG] Saving custom platformio.ini');
    
    const myConfigContent = myPlatformIOConfig.value;
    
    if (!mySelectedPioFolder) {
        myAddLog("ERROR: No PlatformIO folder selected", "error");
        return;
    }
    
    myAddLog("Saving platformio.ini to server...", "info");
    
    try {
        const myResponse = await fetch(mySaveConfigUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                folderPath: mySelectedPioFolder,
                config: myConfigContent 
            })
        });
        
        if (myResponse.ok) {
            const myResult = await myResponse.json();
            myAddLog("platformio.ini saved successfully", "success");
            console.log('[CONFIG] Saved:', myResult);
        } else {
            const myResult = await myResponse.json();
            myAddLog(`ERROR: ${myResult.message}`, "error");
        }
    } catch (error) {
        myAddLog(`ERROR: Cannot save config - ${error.message}`, "error");
    }
}

// ============================================================================
// FILE BROWSER
// ============================================================================

// Handle manual path entry for PlatformIO folder
function myHandlePioFolderPathChange() {
    const myPath = myPioFolderPath.value.trim();
    if (myPath) {
        mySelectedPioFolder = myPath;
        myAddLog(`PlatformIO folder set to: ${myPath}`, "info");
        console.log('[BROWSER] PIO folder manually set:', myPath);
    }
}

// Handle manual path entry for TFLite folder
function myHandleTFLiteFolderPathChange() {
    const myPath = myTFLiteFolderPath.value.trim();
    if (myPath) {
        mySelectedTFLiteFolder = myPath;
        myAddLog(`TFLite folder set to: ${myPath}`, "info");
        console.log('[BROWSER] TFLite folder manually set:', myPath);
        
        // Enable convert button and show info
        myModelInfo.style.display = 'block';
        myModelFolderName.textContent = myPath;
        myOutputLocation.textContent = myPath + '/myOutput';
        myConvertButton.disabled = false;
        
        myAddTFLiteLog(`Model folder set to: ${myPath}`, "success");
        myAddTFLiteLog(`Output will be saved to: myOutput subfolder`, "info");
    }
}

async function myBrowseFolder(myType) {
    console.log(`[BROWSER] Opening folder browser for: ${myType}`);
    
    if (myType === 'pio') {
        myAddLog("Requesting folder selection from server...", "info");
    } else {
        myAddTFLiteLog("Requesting folder selection from server...", "info");
    }
    
    try {
        const myResponse = await fetch(mySelectFolderUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: myType })
        });
        
        if (myResponse.ok) {
            const myResult = await myResponse.json();
            console.log('[BROWSER] Selected:', myResult.folderPath);
            
            if (myType === 'pio') {
                mySelectedPioFolder = myResult.folderPath;
                myPioFolderPath.value = myResult.folderPath;
                myAddLog(`PlatformIO folder: ${myResult.folderPath}`, "success");
            } else if (myType === 'tflite') {
                mySelectedTFLiteFolder = myResult.folderPath;
                myTFLiteFolderPath.value = myResult.folderPath;
                myAddLog(`TFLite folder: ${myResult.folderPath}`, "success");
                
                // Enable convert button and show info
                myModelInfo.style.display = 'block';
                myModelFolderName.textContent = myResult.folderPath;
                myOutputLocation.textContent = myResult.folderPath + '/myOutput';
                myConvertButton.disabled = false;
                
                myAddTFLiteLog(`Model folder selected: ${myResult.folderPath}`, "success");
                myAddTFLiteLog(`Output will be saved to: myOutput subfolder`, "info");
            }
        } else {
            const myResult = await myResponse.json();
            if (myType === 'pio') {
                myAddLog(`ERROR: ${myResult.message}`, "error");
            } else {
                myAddTFLiteLog(`ERROR: ${myResult.message}`, "error");
            }
        }
    } catch (error) {
        const myErrorMsg = `ERROR: Cannot browse folders - ${error.message}`;
        if (myType === 'pio') {
            myAddLog(myErrorMsg, "error");
            myAddLog("You can manually type the folder path in the text box", "info");
        } else {
            myAddTFLiteLog(myErrorMsg, "error");
            myAddTFLiteLog("You can manually type the folder path in the text box", "info");
        }
    }
}

// ============================================================================
// SERIAL CONNECTION (MANUAL)
// ============================================================================

async function myToggleSerialConnection() {
    console.log('[SERIAL] Toggle connection clicked');
    
    if (mySerialConnected) {
        await myDisconnectSerial();
    } else {
        await myConnectSerial();
    }
}

async function myConnectSerial() {
    console.log('[SERIAL] Attempting to connect...');
    myAddLog("Connecting to serial monitor...", "info");
    
    mySerialConnectButton.disabled = true;
    mySerialConnectButton.textContent = "Connecting...";
    
    try {
        // Request serial connection from server
        const myResponse = await fetch(mySerialConnectUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (myResponse.ok) {
            const myResult = await myResponse.json();
            console.log('[SERIAL] Connection successful:', myResult);
            
            myAddLog(`Serial connected on port: ${myResult.port}`, "success");
            myAddSerialLine(`=== CONNECTED TO ${myResult.port} ===`);
            
            // Update UI
            mySerialConnected = true;
            mySerialConnectButton.textContent = "Disconnect Serial";
            mySerialStatus.classList.remove('disconnected');
            mySerialStatus.classList.add('connected');
            mySerialConnectButton.disabled = false;
            
            // Start listening to stream
            myStartSerialStream();
            
        } else {
            const myResult = await myResponse.json();
            myAddLog(`ERROR: ${myResult.message}`, "error");
            mySerialConnectButton.disabled = false;
            mySerialConnectButton.textContent = "Connect Serial";
        }
    } catch (error) {
        myAddLog(`ERROR: Cannot connect - ${error.message}`, "error");
        mySerialConnectButton.disabled = false;
        mySerialConnectButton.textContent = "Connect Serial";
    }
}

/**
 * Sends a request to the bridge server to close the physical serial port,
 * then closes the SSE stream and updates the UI.
 */
async function myDisconnectSerial() {
    console.log('[SERIAL] Disconnecting...');
    
    // 1. Close SSE connection (stops receiving data)
    if (mySerialEventSource) {
        mySerialEventSource.close();
        mySerialEventSource = null;
    }
    
    // 2. Request server to close the actual SerialPort
    if (mySerialConnected) {
        try {
            await fetch(mySerialDisconnectUrl, { method: 'POST' });
            console.log('[SERIAL] Disconnect signal successfully sent to server.');
        } catch (error) {
            console.error('[SERIAL] Error sending disconnect to server:', error);
            myAddLog(`WARNING: Could not signal server to disconnect: ${error.message}`, "warning");
        }
    }

    // 3. Update UI state
    mySerialConnected = false;
    mySerialConnectButton.textContent = "Connect Serial";
    mySerialStatus.classList.remove('connected');
    mySerialStatus.classList.add('disconnected');
    
    myAddLog("Serial monitor disconnected", "info");
    myAddSerialLine("=== DISCONNECTED ===");
}

function myStartSerialStream() {
    console.log('[SERIAL] Starting serial stream...');
    
    try {
        mySerialEventSource = new EventSource(mySerialStreamUrl);
        
        mySerialEventSource.onopen = function() {
            console.log('[SERIAL] Stream connected');
        };
        
        mySerialEventSource.onmessage = function(event) {
            try {
                const myData = JSON.parse(event.data);
                
                if (myData.type === 'serial') {
                    console.log(`[SERIAL DATA] ${myData.message}`);
                    myAddSerialLine(myData.message);
                }
            } catch (error) {
                console.error('[SERIAL] Error parsing message:', error);
            }
        };
        
        mySerialEventSource.onerror = function(error) {
            console.error('[SERIAL] Stream error:', error);
            myAddLog("Serial stream error - reconnect manually", "warning");
        };
        
    } catch (error) {
        console.error('[SERIAL] Failed to start stream:', error);
        myAddLog("Failed to start serial stream", "error");
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
    mySerialConsole.innerHTML = mySerialConnected 
        ? 'Serial console cleared. Monitoring...' 
        : 'Not connected. Click "Connect Serial" to start.';
    myAddLog("Serial console cleared", "info");
}

// ============================================================================
// ARDUINO FUNCTIONALITY
// ============================================================================

async function mySendCodeToPlatformIO() {
    // Explicitly disconnect serial before running PlatformIO upload
    await myDisconnectSerial(); 
    
    console.log('[ARDUINO] Compile & Flash button clicked');
    
    const myCode = myCodeElement.value;
    const myBoard = myBoardElement.value;
    const myConfig = myPlatformIOConfig.value;
    
    if (!mySelectedPioFolder) {
        myAddLog("ERROR: No PlatformIO folder selected", "error");
        return;
    }
    
    myAddLog("=== COMPILE & FLASH STARTED ===", "info");
    myAddLog(`Selected board: ${myBoard}`, "info");
    myAddLog(`Working folder: ${mySelectedPioFolder}`, "info");
    myAddLog(`Code length: ${myCode.length} characters`, "info");
    
    if (!myCode.trim()) {
        myAddLog("ERROR: No code provided", "error");
        return;
    }

    myCompileButton.disabled = true;
    myCompileButton.textContent = "Processing...";

    try {
        const myResponse = await fetch(myLocalServerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                code: myCode, 
                board: myBoard,
                config: myConfig,
                folderPath: mySelectedPioFolder
            }) 
        });

        myAddLog(`Server responded: ${myResponse.status} ${myResponse.statusText}`, 
            myResponse.ok ? "success" : "warning");

        if (myResponse.ok) {
            const myResult = await myResponse.json();
            
            myAddLog("SUCCESS: Compilation and upload completed!", "success");
            myAddLog(myResult.message, "success");
            
            if (myResult.output) {
                myAddLog("=== BUILD OUTPUT ===", "info");
                myAddLog(myResult.output, "info"); // Full output is logged now
            }
        } else {
            const myResult = await myResponse.json();
            myAddLog("FAILURE: Server returned an error", "error");
            myAddLog(myResult.message, "error");
            
            if (myResult.error) {
                myAddLog("=== ERROR DETAILS ===", "error");
                myAddLog(myResult.error, "error");
            }
        }
    } catch (myError) {
        myAddLog("CONNECTION ERROR: Cannot reach bridge server", "error");
        myAddLog(`Error: ${myError.message}`, "error");
    } finally {
        myCompileButton.disabled = false;
        myCompileButton.textContent = "Compile & Flash";
        myAddLog("=== OPERATION COMPLETED ===", "info");
        // Reconnect serial monitor automatically after upload finishes
        await myConnectSerial(); 
    }
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
// SYSTEM CHECKS (NEW)
// ============================================================================

async function myRunSystemChecks() {
    myAddLog("Running PlatformIO and TFLite system checks...", "info");
    mySystemCheckButton.disabled = true;
    mySystemCheckStatus.innerHTML = ""; // Clear previous results
    
    let allChecksPassed = true;

    // --- Check 1: PlatformIO Core Version ---
    const pioResult = await myCheckTool(myPioCheckUrl, "PlatformIO Core CLI");
    myRenderCheckResult(pioResult, "PlatformIO Check");
    if (!pioResult.success) allChecksPassed = false;
    
    // --- Check 2: TFLite Converter Version ---
    const tfliteResult = await myCheckTool(myTFLiteCheckUrl, "TFLite Converter (WSL)", "WSL VENV");
    myRenderCheckResult(tfliteResult, "TFLite Converter Check");
    if (!tfliteResult.success) allChecksPassed = false;

    // Final summary log
    const mySummaryType = allChecksPassed ? "success" : "error";
    const mySummaryMessage = allChecksPassed 
        ? "✓ All System Checks Passed! Environment is ready." 
        : "✗ One or more system checks failed. Review errors above.";
        
    myAddLog(mySummaryMessage, mySummaryType);
    
    mySystemCheckButton.disabled = false;
}

// Generic helper to run a check against an endpoint
async function myCheckTool(myUrl, myToolName, myLocation = "Local") {
    try {
        const myResponse = await fetch(myUrl);
        const myResult = await myResponse.json();
        
        if (myResponse.ok && myResult.success) {
            return {
                success: true,
                tool: myToolName,
                location: myLocation,
                message: `Found: ${myToolName} ${myResult.version || ''}`
            };
        } else {
            return {
                success: false,
                tool: myToolName,
                location: myLocation,
                message: `Failed: ${myToolName} - ${myResult.error || myResult.message}`
            };
        }
    } catch (error) {
        return {
            success: false,
            tool: myToolName,
            location: myLocation,
            message: `Connection Error: Cannot reach server or tool failed. (${error.message})`
        };
    }
}

// Renders the result to the dedicated status area
function myRenderCheckResult(myResult, myTitle) {
    if (!mySystemCheckStatus) return;
    
    const myIcon = myResult.success ? '✓' : '✗';
    const myClass = myResult.success ? 'log-success' : 'log-error';
    const myDetail = myResult.success ? `Version: ${myResult.message.split(' ').pop()}` : myResult.message;
    
    const myHtml = `
        <div class="log-entry ${myClass}">
            <strong style="display: inline-block; width: 140px;">${myIcon} ${myResult.tool}:</strong> 
            <span>${myDetail}</span>
        </div>
    `;
    
    mySystemCheckStatus.innerHTML += myHtml;
}


// ============================================================================
// TFLITE FUNCTIONALITY
// ============================================================================

async function myConvertToKeras() {
    console.log('[TFLITE] Convert button clicked');
    
    if (!mySelectedTFLiteFolder) {
        myAddTFLiteLog("ERROR: No folder selected", "error");
        return;
    }
    
    const myModelName = myModelNameInput.value.trim() || 'model';
    
    myAddTFLiteLog("=== TFLITE CONVERSION STARTED ===", "info");
    myAddTFLiteLog(`Model name: ${myModelName}`, "info");
    myAddTFLiteLog(`Input folder: ${mySelectedTFLiteFolder}`, "info");
    
    myConvertButton.disabled = true;
    myConvertButton.textContent = "Converting...";
    
    try {
        myAddTFLiteLog("Sending conversion request to bridge server...", "info");
        
        const myResponse = await fetch(myTFLiteConvertUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folderPath: mySelectedTFLiteFolder,
                modelName: myModelName
            })
        });
        
        myAddTFLiteLog(`Server responded: ${myResponse.status} ${myResponse.statusText}`, 
            myResponse.ok ? "success" : "warning");
        
        if (myResponse.ok) {
            const myResult = await myResponse.json();
            
            myConvertedModel = {
                filePath: myResult.outputPath,
                fileName: myResult.fileName
            };
            
            myAddTFLiteLog("SUCCESS: Model converted to TFLite C Header!", "success");
            myAddTFLiteLog(`Output file: ${myResult.fileName}`, "success");
            myAddTFLiteLog(`Saved to: ${myResult.outputPath}`, "info");
            
            if (myResult.output) {
                myAddTFLiteLog("=== CONVERSION OUTPUT ===", "info");
                myAddTFLiteLog(myResult.output, "info");
            }
            
            myAddTFLiteLog("File saved to myOutput folder in the model directory", "success");
            
        } else {
            const myResult = await myResponse.json();
            
            myAddTFLiteLog("FAILURE: Conversion failed", "error");
            myAddTFLiteLog(myResult.message, "error");
            
            if (myResult.error) {
                myAddTFLiteLog("=== ERROR DETAILS ===", "error");
                myAddTFLiteLog(myResult.error, "error");
            }
        }
        
    } catch (error) {
        myAddTFLiteLog("CONNECTION ERROR: Cannot reach bridge server", "error");
        myAddTFLiteLog(`Error: ${error.message}`, "error");
    } finally {
        myConvertButton.disabled = false;
        myConvertButton.textContent = "Convert to TFLite C Header";
        myAddTFLiteLog("=== OPERATION COMPLETED ===", "info");
    }
}

function myDownloadKeras() {
    if (!myConvertedModel) {
        myAddTFLiteLog("ERROR: No converted model available", "error");
        return;
    }
    
    myAddTFLiteLog(`Model saved at: ${myConvertedModel.filePath}`, "info");
    myAddTFLiteLog("Open the myOutput folder to access your .h file", "info");
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
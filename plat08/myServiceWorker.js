/*
===============================================================================
INSTALLATION INSTRUCTIONS
===============================================================================

1. THIS FILE:
   Save as: myServiceWorker.js
   Place in root of extension directory

2. REFERENCED BY:
   manifest.json includes this as the background service worker

3. PURPOSE:
   - Initializes the side panel on extension load
   - Sets panel to open when extension icon is clicked
   - Handles extension lifecycle events

4. DEBUGGING:
   - View logs in chrome://extensions (click "service worker" link)
   - Errors will appear in the service worker console

===============================================================================
*/

// Service worker initialization
console.log("[SERVICE WORKER] Starting initialization...");

// Sets the side panel to open when the extension's toolbar icon is clicked
async function myOpenSidePanel() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    console.log("[SERVICE WORKER] ✓ Side panel behavior configured successfully");
    console.log("[SERVICE WORKER] Panel will open when extension icon is clicked");
  } catch (myError) {
    console.error("[SERVICE WORKER] ✗ Error setting side panel behavior:", myError);
  }
}

// Handle extension installation and updates
chrome.runtime.onInstalled.addListener((details) => {
  const myReason = details.reason;
  
  console.log("[SERVICE WORKER] =".repeat(30));
  console.log(`[SERVICE WORKER] Extension ${myReason}`);
  console.log("[SERVICE WORKER] =".repeat(30));
  
  switch (myReason) {
    case 'install':
      console.log("[SERVICE WORKER] First time installation detected");
      console.log("[SERVICE WORKER] Welcome to PlatformIO & TFLite Tools!");
      break;
    case 'update':
      const myPrevVersion = details.previousVersion;
      console.log(`[SERVICE WORKER] Updated from version ${myPrevVersion}`);
      console.log("[SERVICE WORKER] New features may be available");
      break;
    case 'chrome_update':
      console.log("[SERVICE WORKER] Chrome browser was updated");
      break;
  }
  
  // Initialize side panel
  myOpenSidePanel();
  
  console.log("[SERVICE WORKER] Initialization complete");
  console.log("[SERVICE WORKER] Click the extension icon to open side panel");
});

// Handle service worker startup
chrome.runtime.onStartup.addListener(() => {
  console.log("[SERVICE WORKER] Chrome started, service worker activated");
  myOpenSidePanel();
});

// Handle extension icon clicks (if side panel doesn't open automatically)
chrome.action.onClicked.addListener((tab) => {
  console.log("[SERVICE WORKER] Extension icon clicked");
  console.log(`[SERVICE WORKER] Active tab: ${tab.title}`);
  
  // The side panel should open automatically due to setPanelBehavior
  // This is just for logging purposes
});

// Handle messages from the side panel (if needed in future)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[SERVICE WORKER] Message received:", message);
  
  // Future: Handle any messages from the side panel
  // For example: status updates, notifications, etc.
  
  sendResponse({ status: "received" });
  return true; // Keep message channel open for async response
});

// Log when service worker is activated
console.log("[SERVICE WORKER] ✓ Service worker initialized and ready");
console.log("[SERVICE WORKER] Monitoring extension lifecycle events");
console.log("[SERVICE WORKER] =".repeat(30));
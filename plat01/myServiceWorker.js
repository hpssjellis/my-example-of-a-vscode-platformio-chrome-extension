// myServiceWorker.js

// Sets the side panel to open when the extension's toolbar icon is clicked.
// This is an 'async' function as preferred.
async function myOpenSidePanel() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    console.log("Side panel behavior set to open on action click.");
  } catch (myError) {
    console.error("Error setting side panel behavior:", myError);
  }
}

// Ensure the side panel opens on action click when the extension is installed or updated.
chrome.runtime.onInstalled.addListener(myOpenSidePanel);

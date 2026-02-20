// Background service worker for Claude Usage Monitor
// Handles: hidden window refresh, message relay, storage

console.log('[Claude Usage Monitor] Background service worker loaded');

let refreshWindowId = null;

// Listen for messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'USAGE_UPDATE') {
        // Data from content script — already stored by content script
        console.log('[Claude Usage Monitor] Background received usage data');
        sendResponse({ success: true });
    } else if (msg.type === 'REFRESH_REQUEST') {
        // Popup asks us to open a hidden window for fresh data
        performRefresh().then(() => {
            sendResponse({ success: true });
        }).catch(e => {
            sendResponse({ success: false, error: e.message });
        });
        return true; // async response
    }
});

// Open a hidden (minimized) window to settings/usage page
// Content script will auto-run there and extract + save data
async function performRefresh() {
    if (refreshWindowId !== null) {
        console.log('[Claude Usage Monitor] Refresh already in progress');
        return;
    }

    console.log('[Claude Usage Monitor] Opening hidden window for refresh...');

    const win = await chrome.windows.create({
        url: 'https://claude.ai/settings/usage',
        state: 'minimized',
        focused: false
    });

    refreshWindowId = win.id;

    // Close after 8 seconds (enough for page load + content script extraction)
    setTimeout(async () => {
        try {
            if (refreshWindowId !== null) {
                await chrome.windows.remove(refreshWindowId);
                console.log('[Claude Usage Monitor] Refresh window closed');
                refreshWindowId = null;
            }
        } catch (e) {
            refreshWindowId = null;
        }
    }, 8000);
}

// Clean up if window is closed externally
chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === refreshWindowId) {
        refreshWindowId = null;
    }
});

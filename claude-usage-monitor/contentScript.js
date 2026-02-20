// Content script for extracting Claude usage data
// Runs ONLY on https://claude.ai/settings/usage*
// Scrapes the rendered DOM and sends data to background/popup

console.log('[Claude Usage Monitor] Content script loaded on settings/usage page');

let lastSentData = null;
let observer = null;

function init() {
    console.log('[Claude Usage Monitor] Initializing extraction...');
    attemptExtraction();
    setupObserver();
}

function attemptExtraction() {
    try {
        const data = extractAllData();
        if (data) {
            const dataStr = JSON.stringify(data);
            if (dataStr !== lastSentData) {
                lastSentData = dataStr;
                // Store data directly + send message
                chrome.storage.local.set({
                    usageData: data,
                    lastUpdate: Date.now()
                });
                chrome.runtime.sendMessage({ type: 'USAGE_UPDATE', data: data });
                console.log('[Claude Usage Monitor] Data extracted and saved:', data);
            }
        } else {
            console.log('[Claude Usage Monitor] No data found yet, waiting for DOM updates...');
        }
    } catch (e) {
        console.error('[Claude Usage Monitor] Extraction error:', e);
    }
}

function extractAllData() {
    const bodyText = document.body.innerText || '';
    const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l);

    if (lines.length < 3) return null;

    const result = {};

    // --- Current Session / Plan Usage ---
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('current session')) {
            for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
                const pctMatch = lines[j].match(/(\d+)\s*%\s*(used)?/i);
                if (pctMatch) {
                    result.currentSessionPercent = parseInt(pctMatch[1]);
                    break;
                }
            }
            for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
                if (lines[j].toLowerCase().includes('reset')) {
                    result.resetTimeText = lines[j];
                    break;
                }
            }
            break;
        }
    }

    // --- Extra Usage ---
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        if (line.includes('extra usage')) {
            // Look ahead for spent amount, percentage, reset date, limit
            for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
                const spentMatch = lines[j].match(/\$(\d+\.?\d*)\s*spent/i);
                if (spentMatch && !result.extraSpent) {
                    result.extraSpent = parseFloat(spentMatch[1]);
                }

                const pctMatch = lines[j].match(/(\d+)\s*%\s*used/i);
                if (pctMatch && !result.extraPercent) {
                    result.extraPercent = parseInt(pctMatch[1]);
                }

                const resetMatch = lines[j].match(/Resets?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)/i);
                if (resetMatch && !result.extraResetText) {
                    result.extraResetText = resetMatch[0];
                }

                // Limit — a line that's just "$XX" or "$XX.XX"
                const limitMatch = lines[j].match(/^\$(\d+\.?\d*)$/);
                if (limitMatch && !result.extraLimit) {
                    result.extraLimit = parseFloat(limitMatch[1]);
                }
            }
            break;
        }
    }

    // --- Monthly Spending Limit / Credit Balance ---
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        if (line.includes('monthly spending limit') || line.includes('spending limit')) {
            for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
                // Dollar amount (balance)
                const balMatch = lines[j].match(/^\$(\d+\.?\d*)$/);
                if (balMatch && !result.creditBalance) {
                    result.creditBalance = parseFloat(balMatch[1]);
                }

                // "Current balance" or "auto-reload"
                if (lines[j].toLowerCase().includes('current balance')) {
                    result.hasBalance = true;
                }
                if (lines[j].toLowerCase().includes('auto-reload on')) {
                    result.autoReloadOn = true;
                }
                if (lines[j].toLowerCase().includes('auto-reload')) {
                    result.hasAutoReload = true;
                }
            }
            break;
        }
    }

    // --- Also try to get data from the Usage API inline ---
    // (The /api/organizations/ORG_ID/usage endpoint works without page scraping)
    // We leave this to popup.js since content script focuses on DOM

    result.extractedAt = Date.now();

    // Only return if we found at least the current session
    if (result.currentSessionPercent !== undefined) {
        return result;
    }
    return null;
}

function setupObserver() {
    if (observer) return;
    observer = new MutationObserver(() => {
        clearTimeout(window._usageTimeout);
        window._usageTimeout = setTimeout(attemptExtraction, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

// Listen for refresh requests from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'REQUEST_EXTRACTION') {
        attemptExtraction();
        sendResponse({ success: true });
    }
});

// Start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

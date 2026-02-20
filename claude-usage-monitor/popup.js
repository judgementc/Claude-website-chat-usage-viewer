let countdownInterval = null;

// ─── Color Helpers ───
function getUsageColor(pct) {
  if (pct >= 90) return '#ef4444';
  if (pct >= 70) return '#f59e0b';
  if (pct >= 50) return '#eab308';
  return '#22c55e';
}

// ─── Time Formatting ───
function formatCountdown(resetTime) {
  const diff = new Date(resetTime) - new Date();
  if (diff <= 0) return 'Resetting...';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${h}`.padStart(2, '0') + ':' + `${m}`.padStart(2, '0') + ':' + `${s}`.padStart(2, '0');
}

function formatResetBadge(resetTime) {
  const diff = new Date(resetTime) - new Date();
  if (diff <= 0) return 'Resetting...';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return 'Resets in ' + h + ' hr ' + m + ' min';
  return 'Resets in ' + m + ' min';
}

function formatResetDate(resetTime) {
  return new Date(resetTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Ring Update ───
function updateRing(pct) {
  const ring = document.getElementById('ringFill');
  const c = 2 * Math.PI * 34;
  ring.style.strokeDashoffset = c - (pct / 100) * c;
  ring.style.stroke = getUsageColor(pct);
  document.getElementById('ringPercent').textContent = pct + '%';
}

// ─── Countdown ───
function startCountdown(resetTime) {
  if (countdownInterval) clearInterval(countdownInterval);
  const el = document.getElementById('countdown');
  const badge = document.getElementById('resetBadge');
  const tick = () => {
    el.textContent = formatCountdown(resetTime);
    badge.textContent = formatResetBadge(resetTime);
    const h = (new Date(resetTime) - new Date()) / 3600000;
    el.style.color = h < 1 ? '#22c55e' : h < 2 ? '#f59e0b' : '#1a1a1a';
  };
  tick();
  countdownInterval = setInterval(tick, 1000);
}

// ─── Status ───
function setStatus(s, t) {
  document.getElementById('statusDot').className = 'status-dot ' + s;
  document.getElementById('statusText').textContent = t || (s === 'loading' ? 'Loading' : s === 'error' ? 'Error' : 'Connected');
}
function showError(msg) {
  const el = document.getElementById('error');
  el.textContent = msg; el.classList.add('show');
  setStatus('error', 'Error');
}
function hideError() { document.getElementById('error').classList.remove('show'); }
function updateLastUpdate() {
  document.getElementById('lastUpdate').textContent = 'Last updated: ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// ─── Cookie Extraction ───
function extractIdsFromCookies(cookies) {
  const r = { orgId: null, anonymousId: null, deviceId: null };
  for (const c of cookies) {
    if (c.name === 'lastActiveOrg') r.orgId = c.value;
    else if (c.name === 'ajs_anonymous_id') r.anonymousId = c.value;
    else if (c.name === 'anthropic-device-id') r.deviceId = c.value;
  }
  return r;
}

// ══════════════════════════════════════════════════
// Runs INSIDE any claude.ai page context.
// 100% self-contained. Fetches ALL data via same-origin requests.
// No need to be on settings page — just any claude.ai tab.
// ══════════════════════════════════════════════════
function executeInPage(orgId, anonymousId, deviceId) {
  var apiHeaders = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'anthropic-anonymous-id': anonymousId || '',
    'anthropic-client-platform': 'web_claude_ai',
    'anthropic-client-sha': 'c7b39fd963cf6d1b28a4d1e59433bcc0124e946a',
    'anthropic-client-version': '1.0.0',
    'anthropic-device-id': deviceId || ''
  };

  // 1. Usage API — always works
  var usageP = fetch('https://claude.ai/api/organizations/' + orgId + '/usage?_t=' + Date.now(), {
    method: 'GET', credentials: 'include', headers: apiHeaders
  }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });

  // 2. Fetch settings/usage page as HTML (same-origin, cookies included automatically)
  var pageP = fetch('https://claude.ai/settings/usage?_t=' + Date.now(), {
    credentials: 'include',
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  })
    .then(function (r) {
      console.log('[Claude Usage Monitor] Page response status:', r.status, r.statusText);
      console.log('[Claude Usage Monitor] Page response URL:', r.url);
      return r.text();
    })
    .then(function (html) {
      console.log('[Claude Usage Monitor] HTML length:', html.length);
      console.log('[Claude Usage Monitor] HTML first 3000 chars:', html.substring(0, 3000));
      console.log('[Claude Usage Monitor] HTML last 1000 chars:', html.substring(html.length - 1000));

      var result = {};

      // Count script tags
      var scriptTags = html.match(/<script[^>]*>/g);
      console.log('[Claude Usage Monitor] Script tags found:', scriptTags ? scriptTags.length : 0);

      // Look for __next_f in any form
      var hasNextF = html.indexOf('__next_f') !== -1;
      console.log('[Claude Usage Monitor] Contains __next_f:', hasNextF);

      // Look for __NEXT_DATA__ in any form
      var hasNextData = html.indexOf('__NEXT_DATA__') !== -1;
      console.log('[Claude Usage Monitor] Contains __NEXT_DATA__:', hasNextData);

      // Search for key data patterns directly in HTML
      var hasAmount = html.indexOf('"amount"') !== -1;
      var hasCurrency = html.indexOf('"currency"') !== -1;
      var hasSpent = html.indexOf('spent') !== -1;
      var hasAutoReload = html.indexOf('auto_reload') !== -1;
      console.log('[Claude Usage Monitor] Data patterns - amount:', hasAmount, 'currency:', hasCurrency, 'spent:', hasSpent, 'auto_reload:', hasAutoReload);

      // Extract credit data directly from HTML
      var creditIdx = html.indexOf('"amount"');
      if (creditIdx !== -1) {
        console.log('[Claude Usage Monitor] Context around "amount":', html.substring(Math.max(0, creditIdx - 50), creditIdx + 200));
        var amountMatch = html.substring(creditIdx).match(/"amount"\s*:\s*(\d+)/);
        if (amountMatch) {
          result.creditAmount = parseInt(amountMatch[1]);
          console.log('[Claude Usage Monitor] Found credit amount:', result.creditAmount);
        }
      }

      // Extract auto_reload
      var arIdx = html.indexOf('auto_reload_settings');
      if (arIdx !== -1) {
        var arContext = html.substring(arIdx, arIdx + 300);
        console.log('[Claude Usage Monitor] auto_reload context:', arContext);
        var arEnabled = arContext.indexOf('"enabled":true') !== -1 || arContext.indexOf('"enabled": true') !== -1;
        result.autoReloadEnabled = arEnabled;

        var threshMatch = arContext.match(/threshold_in_minor_units["\s:]+(\d+)/);
        if (threshMatch) result.autoReloadThreshold = parseInt(threshMatch[1]);

        var reloadToMatch = arContext.match(/reload_to_in_minor_units["\s:]+(\d+)/);
        if (reloadToMatch) result.autoReloadTo = parseInt(reloadToMatch[1]);
      }

      // Extract currency
      var currMatch = html.match(/"currency"\s*:\s*"(\w+)"/);
      if (currMatch) result.creditCurrency = currMatch[1];

      // Extract "$X.XX spent"
      var spentMatch = html.match(/\$(\d+\.?\d*)\s*spent/i);
      if (spentMatch) result.extraSpent = parseFloat(spentMatch[1]);

      // Extract "Resets Mon DD"
      var resetMatch = html.match(/Resets?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)/i);
      if (resetMatch) result.resetText = resetMatch[0];

      // Extract spending limit
      var limitMatch = html.match(/\$(\d+)\s*(?:\n|<|spending|limit)/i);
      if (limitMatch) result.spendingLimit = parseInt(limitMatch[1]);

      console.log('[Claude Usage Monitor] Parsed result:', JSON.stringify(result, null, 2));
      return result;
    })
    .catch(function (e) {
      console.error('[Claude Usage Monitor] Page fetch error:', e);
      return { error: e.message };
    });

  return Promise.all([usageP, pageP]).then(function (results) {
    return { usage: results[0], page: results[1] };
  });
}

// ─── Render Credit ───
function renderCredit(data) {
  if (!data.page) return;

  if (data.page.creditAmount) {
    var amount = data.page.creditAmount / 100;
    document.getElementById('billingCard').classList.remove('hidden');
    document.getElementById('billingBalance').textContent = '$' + amount.toFixed(2);

    if (data.page.autoReloadEnabled) {
      document.getElementById('autoReloadTag').classList.remove('hidden');
    }
    if (data.page.autoReloadTo) {
      var reloadTo = data.page.autoReloadTo / 100;
      var threshold = (data.page.autoReloadThreshold || 0) / 100;
      document.getElementById('billingLimit').textContent =
        'Reload to $' + reloadTo.toFixed(2) + ' at $' + threshold.toFixed(2);
    }
  } else {
    console.log('[Claude Usage Monitor] No credit data in page');
  }
}

// ─── Render Extra Usage ───
function renderExtraUsage(data) {
  var spent = null, resetText = null, limit = 40;

  // From page parsing
  if (data.page) {
    if (data.page.extraSpent !== undefined) spent = data.page.extraSpent;
    if (data.page.resetText) resetText = data.page.resetText;
    if (data.page.spendingLimit) limit = data.page.spendingLimit;
  }

  // From usage API (if extra_usage becomes non-null)
  if (spent === null && data.usage && data.usage.extra_usage) {
    var eu = data.usage.extra_usage;
    spent = eu.spent || eu.amount;
  }

  if (spent !== null) {
    document.getElementById('extraUsageCard').classList.remove('hidden');
    var pct = Math.round((spent / limit) * 100);
    document.getElementById('extraSpent').textContent = '$' + spent.toFixed(2) + ' spent';
    document.getElementById('extraLimit').textContent = 'of $' + limit.toFixed(2);
    document.getElementById('extraFill').style.width = Math.min(pct, 100) + '%';
    document.getElementById('extraPercent').textContent = pct + '% used';
    if (resetText) {
      document.getElementById('extraResetDate').textContent = resetText;
      document.getElementById('extraResetBadge').textContent = resetText;
    }
  } else {
    console.log('[Claude Usage Monitor] No extra usage data');
  }
}

// ─── Main ───
async function fetchUsage() {
  hideError();
  setStatus('loading', 'Loading');
  try {
    var cookies = await chrome.cookies.getAll({ domain: 'claude.ai' });
    var ids = extractIdsFromCookies(cookies);
    if (!ids.orgId) { showError('Please log in to claude.ai first'); return; }

    // Use ANY claude.ai tab — no need for settings page
    var tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
    if (tabs.length === 0) { showError('Please open a claude.ai tab first'); return; }

    var results = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: executeInPage,
      args: [ids.orgId, ids.anonymousId, ids.deviceId]
    });

    if (!results || !results.length || !results[0].result) {
      throw new Error('Script execution failed');
    }

    var data = results[0].result;
    console.log('[Claude Usage Monitor] Usage:', JSON.stringify(data.usage, null, 2));
    console.log('[Claude Usage Monitor] Page data:', JSON.stringify(data.page, null, 2));

    // Plan Usage
    if (data.usage && data.usage.five_hour) {
      updateRing(Math.round(data.usage.five_hour.utilization));
      startCountdown(data.usage.five_hour.resets_at);
      document.getElementById('resetTime').textContent = formatResetDate(data.usage.five_hour.resets_at);
    } else {
      document.getElementById('ringPercent').textContent = 'N/A';
      document.getElementById('countdown').textContent = '--:--:--';
    }

    renderExtraUsage(data);
    renderCredit(data);
    setStatus('', 'Connected');
    updateLastUpdate();
    chrome.storage.local.set({ cachedData: data, lastUpdate: Date.now() });

  } catch (e) {
    console.error('[Claude Usage Monitor] Fetch error:', e);
    showError('Failed to fetch: ' + e.message);
    try {
      var cached = await chrome.storage.local.get(['cachedData', 'lastUpdate']);
      if (cached.cachedData) {
        var d = cached.cachedData;
        if (d.usage && d.usage.five_hour) {
          updateRing(Math.round(d.usage.five_hour.utilization));
          if (d.usage.five_hour.resets_at) startCountdown(d.usage.five_hour.resets_at);
        }
        renderExtraUsage(d);
        renderCredit(d);
        document.getElementById('lastUpdate').textContent = 'Cached: ' + new Date(cached.lastUpdate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      }
    } catch (ce) { }
  }
}

document.getElementById('refreshBtn').addEventListener('click', fetchUsage);
document.getElementById('openClaudeBtn').addEventListener('click', function () {
  chrome.tabs.create({ url: 'https://claude.ai' });
});
document.getElementById('openSettingsBtn').addEventListener('click', function () {
  chrome.tabs.create({ url: 'https://claude.ai/settings/usage' });
});

fetchUsage();

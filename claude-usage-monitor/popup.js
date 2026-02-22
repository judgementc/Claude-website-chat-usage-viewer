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
  document.getElementById('statusText').textContent = t || '';
}
function showError(msg) {
  const el = document.getElementById('error');
  el.textContent = msg; el.classList.add('show');
  setStatus('error', 'Error');
}
function hideError() { document.getElementById('error').classList.remove('show'); }
function updateLastUpdate(ts) {
  const d = ts ? new Date(ts) : new Date();
  document.getElementById('lastUpdate').textContent =
    'Last updated: ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
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

// ─── Render extra usage from content script data ───
function renderExtraUsage(data) {
  if (!data) return;

  if (data.extraSpent !== undefined) {
    document.getElementById('extraUsageCard').classList.remove('hidden');
    const limit = data.extraLimit || 40;
    const pct = data.extraPercent || Math.round((data.extraSpent / limit) * 100);

    document.getElementById('extraSpent').textContent = '$' + data.extraSpent.toFixed(2) + ' spent';
    document.getElementById('extraLimit').textContent = 'of $' + limit.toFixed(2);
    document.getElementById('extraFill').style.width = Math.min(pct, 100) + '%';
    document.getElementById('extraPercent').textContent = pct + '% used';

    if (data.extraResetText) {
      document.getElementById('extraResetDate').textContent = data.extraResetText;
      document.getElementById('extraResetBadge').textContent = data.extraResetText;
    }
  }
}

// ─── Render credit/billing from content script data ───
function renderCredit(data) {
  if (!data) return;

  if (data.creditBalance !== undefined) {
    document.getElementById('billingCard').classList.remove('hidden');
    document.getElementById('billingBalance').textContent = '$' + data.creditBalance.toFixed(2);

    if (data.autoReloadOn) {
      document.getElementById('autoReloadTag').classList.remove('hidden');
    }
  }
}

// ─── Fetch live plan usage from API (this always works) ───
async function fetchPlanUsage(orgId, anonymousId, deviceId) {
  const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
  if (tabs.length === 0) return null;

  const results = await chrome.scripting.executeScript({
    target: { tabId: tabs[0].id },
    func: function (orgId, anonId, devId) {
      return fetch('https://claude.ai/api/organizations/' + orgId + '/usage?_t=' + Date.now(), {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'anthropic-anonymous-id': anonId || '',
          'anthropic-client-platform': 'web_claude_ai',
          'anthropic-client-sha': 'c7b39fd963cf6d1b28a4d1e59433bcc0124e946a',
          'anthropic-client-version': '1.0.0',
          'anthropic-device-id': devId || ''
        }
      }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    },
    args: [orgId, anonymousId, deviceId]
  });

  return (results && results.length > 0) ? results[0].result : null;
}

// ─── Main ───
async function fetchUsage() {
  hideError();
  setStatus('loading', 'Loading');

  try {
    const cookies = await chrome.cookies.getAll({ domain: 'claude.ai' });
    const ids = extractIdsFromCookies(cookies);
    if (!ids.orgId) { showError('Please log in to claude.ai first'); return; }

    // 1. Fetch live plan usage from API
    const usage = await fetchPlanUsage(ids.orgId, ids.anonymousId, ids.deviceId);

    if (usage && usage.five_hour) {
      updateRing(Math.round(usage.five_hour.utilization));
      startCountdown(usage.five_hour.resets_at);
      document.getElementById('resetTime').textContent = formatResetDate(usage.five_hour.resets_at);
    } else {
      document.getElementById('ringPercent').textContent = 'N/A';
      document.getElementById('countdown').textContent = '--:--:--';
    }

    // 2. Read extra usage + credit data from storage (saved by content script)
    const stored = await chrome.storage.local.get(['usageData', 'lastUpdate']);

    if (stored.usageData) {
      renderExtraUsage(stored.usageData);
      renderCredit(stored.usageData);

      // Show how fresh the data is
      if (stored.lastUpdate) {
        const age = Date.now() - stored.lastUpdate;
        const mins = Math.floor(age / 60000);
        if (mins < 1) {
          updateLastUpdate(stored.lastUpdate);
        } else {
          document.getElementById('lastUpdate').textContent =
            'Usage data: ' + mins + ' min ago';
        }
      }
    } else {
      // No content script data yet — trigger a background refresh
      console.log('[Claude Usage Monitor] No stored data, requesting background refresh...');
      chrome.runtime.sendMessage({ type: 'REFRESH_REQUEST' });
      document.getElementById('lastUpdate').textContent =
        'Loading extra data... click Refresh in ~10s';
    }

    setStatus('', 'Connected');
    if (!stored.usageData) {
      updateLastUpdate();
    }

  } catch (e) {
    console.error('[Claude Usage Monitor] Error:', e);
    showError('Failed to fetch: ' + e.message);
  }
}

// ─── Refresh button: trigger background hidden window ───
async function handleRefresh() {
  hideError();
  setStatus('loading', 'Refreshing...');
  document.getElementById('lastUpdate').textContent = 'Refreshing... please wait ~8s';

  try {
    // 1. Trigger background to open hidden settings page
    chrome.runtime.sendMessage({ type: 'REFRESH_REQUEST' });

    // 2. Wait 8 seconds for content script to extract data
    await new Promise(r => setTimeout(r, 8500));

    // 3. Now fetch everything fresh
    await fetchUsage();
  } catch (e) {
    showError('Refresh failed: ' + e.message);
  }
}

// ─── Listen for storage changes (content script updates) ───
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.usageData) {
    console.log('[Claude Usage Monitor] Storage updated, refreshing UI');
    const data = changes.usageData.newValue;
    renderExtraUsage(data);
    renderCredit(data);
    updateLastUpdate();
  }
});

// ─── Event Listeners ───
document.getElementById('refreshBtn').addEventListener('click', handleRefresh);
document.getElementById('openClaudeBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://claude.ai' });
});
document.getElementById('openSettingsBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://claude.ai/settings/usage' });
});

// ─── Init ───
fetchUsage();

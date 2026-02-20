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

function formatMonthlyReset(dateStr) {
  return 'Resets ' + new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric' });
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
// This function runs INSIDE the claude.ai page context.
// It must be 100% self-contained — no outside references.
// ══════════════════════════════════════════════════
function executeInPage(orgId, anonymousId, deviceId) {
  var headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'anthropic-anonymous-id': anonymousId || '',
    'anthropic-client-platform': 'web_claude_ai',
    'anthropic-client-sha': 'c7b39fd963cf6d1b28a4d1e59433bcc0124e946a',
    'anthropic-client-version': '1.0.0',
    'anthropic-device-id': deviceId || ''
  };

  // 1. Usage API
  var usageP = fetch('https://claude.ai/api/organizations/' + orgId + '/usage', {
    method: 'GET', credentials: 'include', headers: headers
  }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });

  // 2. RSC flight data from settings/usage page
  var rscP = fetch('https://claude.ai/settings/usage', {
    credentials: 'include',
    headers: { 'RSC': '1', 'Next-Url': '/settings/usage', 'Accept': 'text/x-component' }
  })
    .then(function (r) { return r.text(); })
    .then(function (text) {
      console.log('[Claude Usage Monitor] RSC length:', text.length);
      console.log('[Claude Usage Monitor] RSC first 3000 chars:', text.substring(0, 3000));

      var result = { raw_sample: text.substring(0, 500) };

      // Credit: {"amount":NNNN,"currency":"USD",...}
      var cm = text.match(/"amount"\s*:\s*(\d+)\s*,\s*"currency"\s*:\s*"(\w+)"/);
      if (cm) {
        result.creditAmount = parseInt(cm[1]);
        result.creditCurrency = cm[2];
      }

      // Auto-reload
      var arm = text.match(/"enabled"\s*:\s*(true|false)\s*,\s*"threshold_in_minor_units"\s*:\s*(\d+)\s*,\s*"reload_to_in_minor_units"\s*:\s*(\d+)/);
      if (arm) {
        result.autoReloadEnabled = arm[1] === 'true';
        result.autoReloadThreshold = parseInt(arm[2]);
        result.autoReloadTo = parseInt(arm[3]);
      }

      // Dollar amounts like $4.06
      var dollarMatches = text.match(/\$\d+\.?\d*/g);
      if (dollarMatches) result.dollarAmounts = dollarMatches;

      // "X% used"
      var pm = text.match(/(\d+)%\s*used/i);
      if (pm) result.pctUsed = parseInt(pm[1]);

      // "$X.XX spent"
      var sm = text.match(/\$(\d+\.?\d*)\s*spent/i);
      if (sm) result.amountSpent = parseFloat(sm[1]);

      // Reset dates
      var rm = text.match(/Resets?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)/i);
      if (rm) result.resetText = rm[0];

      return result;
    })
    .catch(function (e) {
      console.log('[Claude Usage Monitor] RSC error:', e.message);
      return { error: e.message };
    });

  // 3. DOM scraping (only if on settings/usage page)
  var dom = null;
  if (window.location.pathname.indexOf('/settings/usage') !== -1) {
    console.log('[Claude Usage Monitor] On settings page, scraping DOM...');
    dom = {};
    var bodyText = document.body.innerText || '';

    var ds = bodyText.match(/\$(\d+\.?\d*)\s*spent/i);
    if (ds) dom.spent = parseFloat(ds[1]);

    var dp = bodyText.match(/(\d+)%\s*used/i);
    if (dp) dom.pctUsed = parseInt(dp[1]);

    var dr = bodyText.match(/Resets?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)/i);
    if (dr) dom.resetText = dr[0];

    var dd = bodyText.match(/\$\d+\.\d{2}/g);
    if (dd) dom.dollarAmounts = dd;

    dom.hasAutoReload = bodyText.indexOf('auto-reload') !== -1 || bodyText.indexOf('Auto-reload') !== -1;
  }

  return Promise.all([usageP, rscP]).then(function (results) {
    return { usage: results[0], rsc: results[1], dom: dom };
  });
}

// ─── Render Credit ───
function renderCredit(data) {
  var amount = null, autoReload = false, reloadTo = 0, threshold = 0;

  if (data.rsc) {
    if (data.rsc.creditAmount) {
      amount = data.rsc.creditAmount / 100;
      autoReload = data.rsc.autoReloadEnabled || false;
      reloadTo = (data.rsc.autoReloadTo || 0) / 100;
      threshold = (data.rsc.autoReloadThreshold || 0) / 100;
    }
  }

  if (amount === null && data.dom && data.dom.dollarAmounts) {
    var nums = data.dom.dollarAmounts.map(function (s) { return parseFloat(s.replace('$', '')); });
    if (nums.length > 0) amount = Math.max.apply(null, nums);
    autoReload = data.dom.hasAutoReload;
  }

  if (amount !== null) {
    document.getElementById('billingCard').classList.remove('hidden');
    document.getElementById('billingBalance').textContent = '$' + amount.toFixed(2);
    if (autoReload) document.getElementById('autoReloadTag').classList.remove('hidden');
    if (reloadTo > 0) {
      document.getElementById('billingLimit').textContent = 'Reload to $' + reloadTo.toFixed(2) + ' at $' + threshold.toFixed(2);
    }
  } else {
    console.log('[Claude Usage Monitor] No credit data found');
  }
}

// ─── Render Extra Usage ───
function renderExtraUsage(data) {
  var spent = null, resetText = null, limit = 40;

  // RSC
  if (data.rsc) {
    if (data.rsc.amountSpent !== undefined) spent = data.rsc.amountSpent;
    if (data.rsc.resetText) resetText = data.rsc.resetText;
  }
  // usage.extra_usage
  if (spent === null && data.usage && data.usage.extra_usage) {
    var eu = data.usage.extra_usage;
    spent = eu.spent || eu.amount;
  }
  // DOM
  if (spent === null && data.dom) {
    if (data.dom.spent !== undefined) spent = data.dom.spent;
    if (data.dom.resetText && !resetText) resetText = data.dom.resetText;
  }

  if (spent !== null) {
    document.getElementById('extraUsageCard').classList.remove('hidden');
    // Always calculate percentage from spent/limit (don't scrape — it picks up Plan Usage's %)
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
    console.log('[Claude Usage Monitor] No extra usage data found');
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
    console.log('[Claude Usage Monitor] RSC:', JSON.stringify(data.rsc, null, 2));
    console.log('[Claude Usage Monitor] DOM:', JSON.stringify(data.dom, null, 2));

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

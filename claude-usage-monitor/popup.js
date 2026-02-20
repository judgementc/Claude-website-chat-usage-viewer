let countdownInterval = null;

// ─── Cookie Extraction ───
function extractIdsFromCookies(cookies) {
  const result = { orgId: null, anonymousId: null, deviceId: null };
  for (const cookie of cookies) {
    switch (cookie.name) {
      case 'lastActiveOrg': result.orgId = cookie.value; break;
      case 'ajs_anonymous_id': result.anonymousId = cookie.value; break;
      case 'anthropic-device-id': result.deviceId = cookie.value; break;
    }
  }
  return result;
}

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
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatResetBadge(resetTime) {
  const diff = new Date(resetTime) - new Date();
  if (diff <= 0) return 'Resetting...';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `Resets in ${h} hr ${m} min`;
  return `Resets in ${m} min`;
}

function formatResetDate(resetTime) {
  const d = new Date(resetTime);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatMonthlyReset(dateStr) {
  const d = new Date(dateStr);
  return `Resets ${d.toLocaleString('en-US', { month: 'short', day: 'numeric' })}`;
}

// ─── Circular Ring Update ───
function updateRing(pct) {
  const ring = document.getElementById('ringFill');
  const circumference = 2 * Math.PI * 34;
  const offset = circumference - (pct / 100) * circumference;
  ring.style.strokeDashoffset = offset;
  ring.style.stroke = getUsageColor(pct);
  document.getElementById('ringPercent').textContent = `${pct}%`;
}

// ─── Countdown Timer ───
function startCountdown(resetTime) {
  if (countdownInterval) clearInterval(countdownInterval);
  const countdownEl = document.getElementById('countdown');
  const badgeEl = document.getElementById('resetBadge');

  const update = () => {
    countdownEl.textContent = formatCountdown(resetTime);
    badgeEl.textContent = formatResetBadge(resetTime);

    const diff = new Date(resetTime) - new Date();
    const hours = diff / 3600000;
    if (hours < 1) countdownEl.style.color = '#22c55e';
    else if (hours < 2) countdownEl.style.color = '#f59e0b';
    else countdownEl.style.color = '#1a1a1a';
  };
  update();
  countdownInterval = setInterval(update, 1000);
}

// ─── Status Helpers ───
function setStatus(status, text) {
  const dot = document.getElementById('statusDot');
  dot.className = 'status-dot ' + status;
  document.getElementById('statusText').textContent = text || (status === 'loading' ? 'Loading' : status === 'error' ? 'Error' : 'Connected');
}

function showError(message) {
  const el = document.getElementById('error');
  el.textContent = message;
  el.classList.add('show');
  setStatus('error', 'Error');
}

function hideError() {
  document.getElementById('error').classList.remove('show');
}

function updateLastUpdate() {
  document.getElementById('lastUpdate').textContent = `Last updated: ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}

// ─── API Call executed in page context ───
function executeInPage(orgId, anonymousId, deviceId) {
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'anthropic-anonymous-id': anonymousId || '',
    'anthropic-client-platform': 'web_claude_ai',
    'anthropic-client-sha': 'c7b39fd963cf6d1b28a4d1e59433bcc0124e946a',
    'anthropic-client-version': '1.0.0',
    'anthropic-device-id': deviceId || ''
  };

  const fetchJson = (url) => fetch(url, { method: 'GET', credentials: 'include', headers })
    .then(res => {
      if (!res.ok) return { _status: res.status, _url: url };
      return res.json();
    })
    .catch(e => ({ _error: e.message, _url: url }));

  const base = `https://claude.ai/api/organizations/${orgId}`;

  // Strategy 1: Try many possible API endpoints
  const apiPromises = Promise.all([
    fetchJson(`${base}/usage`),
    fetchJson(`${base}/credit`),
    fetchJson(`${base}/credits`),
    fetchJson(`${base}/billing`),
    fetchJson(`${base}/subscription`),
    fetchJson(`${base}/settings/billing`),
    fetchJson(`${base}/prepaid_credits`),
    fetchJson(`${base}/extra_usage`),
  ]).then(([usage, credit, credits, billing, subscription, settingsBilling, prepaidCredits, extraUsage]) => ({
    usage, credit, credits, billing, subscription, settingsBilling, prepaidCredits, extraUsage
  }));

  // Strategy 2: Parse settings/usage page HTML for embedded data
  const pagePromise = fetch('https://claude.ai/settings/usage', {
    credentials: 'include',
    headers: { 'Accept': 'text/html' }
  })
    .then(res => res.text())
    .then(html => {
      const result = { pageData: null };

      // Try __NEXT_DATA__
      const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (nextMatch) {
        try {
          result.pageData = JSON.parse(nextMatch[1]);
        } catch (e) { }
      }

      // Try to find JSON-like data with credit/amount patterns
      const creditMatch = html.match(/"amount"\s*:\s*(\d+)\s*,\s*"currency"\s*:\s*"(\w+)"/);
      if (creditMatch) {
        result.creditFromHtml = {
          amount: parseInt(creditMatch[1]),
          currency: creditMatch[2]
        };
      }

      // Try to find auto_reload_settings in page
      const reloadMatch = html.match(/"auto_reload_settings"\s*:\s*(\{[^}]+\})/);
      if (reloadMatch) {
        try {
          result.autoReloadFromHtml = JSON.parse(reloadMatch[1]);
        } catch (e) { }
      }

      // Try to find extra usage / spending data patterns
      const spentMatch = html.match(/\$(\d+\.?\d*)\s*spent/i);
      if (spentMatch) {
        result.extraSpentFromHtml = parseFloat(spentMatch[1]);
      }

      const pctMatch = html.match(/(\d+)%\s*used/i);
      if (pctMatch) {
        result.extraPctFromHtml = parseInt(pctMatch[1]);
      }

      // Look for RSC / flight data chunks
      const rscChunks = [];
      const rscRegex = /self\.__next_f\.push\(\[[\d,]*"([^"]+)"\]\)/g;
      let m;
      while ((m = rscRegex.exec(html)) !== null) {
        rscChunks.push(m[1]);
      }
      if (rscChunks.length > 0) {
        result.rscChunkCount = rscChunks.length;
        // Search chunks for credit/amount data
        const allChunks = rscChunks.join('');
        const chunkCreditMatch = allChunks.match(/"amount"\s*:\s*(\d+)/);
        if (chunkCreditMatch) {
          result.creditFromRSC = parseInt(chunkCreditMatch[1]);
        }
        // Look for spent/used patterns
        const chunkSpentMatch = allChunks.match(/(\d+\.?\d*)\s*spent/);
        if (chunkSpentMatch) {
          result.spentFromRSC = parseFloat(chunkSpentMatch[1]);
        }
      }

      return result;
    })
    .catch(e => ({ _pageError: e.message }));

  return Promise.all([apiPromises, pagePromise]).then(([api, page]) => ({
    ...api,
    page
  }));
}

// ─── Render Credit / Billing Section ───
function renderCredit(data) {
  let creditAmount = null;
  let autoReload = null;

  // Source 1: API endpoints
  for (const key of ['credit', 'credits', 'billing', 'subscription', 'settingsBilling', 'prepaidCredits']) {
    const src = data[key];
    if (src && !src._status && !src._error) {
      console.log(`[Claude Usage Monitor] ${key} response:`, JSON.stringify(src, null, 2));
      if (src.amount !== undefined) {
        creditAmount = src.amount / 100;
        autoReload = src.auto_reload_settings;
        break;
      }
      if (src.balance !== undefined) {
        creditAmount = typeof src.balance === 'number' && src.balance > 100 ? src.balance / 100 : src.balance;
        autoReload = src.auto_reload_settings || src.auto_reload;
        break;
      }
    }
  }

  // Source 2: Settings page HTML parsing
  if (creditAmount === null && data.page) {
    if (data.page.creditFromHtml) {
      creditAmount = data.page.creditFromHtml.amount / 100;
      autoReload = data.page.autoReloadFromHtml;
    }
    if (creditAmount === null && data.page.creditFromRSC) {
      creditAmount = data.page.creditFromRSC / 100;
    }
    // Source 3: __NEXT_DATA__
    if (creditAmount === null && data.page.pageData) {
      const pd = data.page.pageData;
      console.log('[Claude Usage Monitor] __NEXT_DATA__ keys:', Object.keys(pd));
      // Try to deep-search for credit data
      const deepSearch = (obj, depth = 0) => {
        if (depth > 5 || !obj || typeof obj !== 'object') return null;
        if (obj.amount !== undefined && obj.currency !== undefined) return obj;
        for (const val of Object.values(obj)) {
          const found = deepSearch(val, depth + 1);
          if (found) return found;
        }
        return null;
      };
      const found = deepSearch(pd);
      if (found) {
        creditAmount = found.amount / 100;
        autoReload = found.auto_reload_settings;
      }
    }
  }

  if (creditAmount !== null) {
    const card = document.getElementById('billingCard');
    card.classList.remove('hidden');
    document.getElementById('billingBalance').textContent = `$${creditAmount.toFixed(2)}`;

    if (autoReload && autoReload.enabled) {
      document.getElementById('autoReloadTag').classList.remove('hidden');
    }

    if (autoReload) {
      const reloadTo = (autoReload.reload_to_in_minor_units || 0) / 100;
      const threshold = (autoReload.threshold_in_minor_units || 0) / 100;
      document.getElementById('billingLimit').textContent =
        `Reload to $${reloadTo.toFixed(2)} at $${threshold.toFixed(2)}`;
    }
  } else {
    console.log('[Claude Usage Monitor] No credit data found from any source');
  }
}

// ─── Render Extra Usage Section ───
function renderExtraUsage(data) {
  let spent = null, limit = null, pct = null, resetDate = null;

  // Source 1: API extra_usage endpoint
  const eu = data.extraUsage;
  if (eu && !eu._status && !eu._error) {
    console.log('[Claude Usage Monitor] Extra usage endpoint:', JSON.stringify(eu, null, 2));
    spent = eu.spent || eu.amount || eu.usage_amount;
    limit = eu.limit || eu.cap || eu.spending_limit;
    pct = eu.utilization || eu.percent_used;
    resetDate = eu.resets_at || eu.reset_date || eu.period_end;
  }

  // Source 2: usage.extra_usage (when non-null)
  if (spent === null && data.usage && data.usage.extra_usage) {
    const ue = data.usage.extra_usage;
    spent = ue.spent || ue.amount;
    limit = ue.limit || ue.cap;
    pct = ue.utilization;
    resetDate = ue.resets_at || ue.reset_date;
  }

  // Source 3: HTML page scraping
  if (spent === null && data.page) {
    if (data.page.extraSpentFromHtml !== undefined) {
      spent = data.page.extraSpentFromHtml;
    }
    if (data.page.extraPctFromHtml !== undefined) {
      pct = data.page.extraPctFromHtml;
    }
    if (data.page.spentFromRSC !== undefined && spent === null) {
      spent = data.page.spentFromRSC;
    }
  }

  // Source 4: subscription data
  for (const key of ['subscription', 'billing', 'settingsBilling']) {
    if (spent !== null) break;
    const src = data[key];
    if (src && !src._status && !src._error) {
      spent = src.extra_usage_spent || src.metered_spend || src.extra_usage_amount;
      limit = src.extra_usage_limit || src.spending_cap || src.spending_limit;
      resetDate = src.billing_cycle_end || src.period_end;
    }
  }

  if (spent !== null && spent !== undefined) {
    const card = document.getElementById('extraUsageCard');
    card.classList.remove('hidden');

    limit = limit || 40;
    if (pct === null) pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;

    document.getElementById('extraSpent').textContent = `$${Number(spent).toFixed(2)} spent`;
    document.getElementById('extraLimit').textContent = `of $${Number(limit).toFixed(2)}`;
    document.getElementById('extraFill').style.width = `${Math.min(pct, 100)}%`;
    document.getElementById('extraPercent').textContent = `${pct}% used`;

    if (resetDate) {
      document.getElementById('extraResetDate').textContent = formatMonthlyReset(resetDate);
      document.getElementById('extraResetBadge').textContent = formatMonthlyReset(resetDate);
    }
  } else {
    console.log('[Claude Usage Monitor] No extra usage data found');
  }
}

// ─── Main Fetch ───
async function fetchUsage() {
  hideError();
  setStatus('loading', 'Loading');

  try {
    const cookies = await chrome.cookies.getAll({ domain: 'claude.ai' });
    const ids = extractIdsFromCookies(cookies);

    if (!ids.orgId) {
      showError('Please log in to claude.ai first');
      return;
    }

    const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
    if (tabs.length === 0) {
      showError('Please open a claude.ai tab first');
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: executeInPage,
      args: [ids.orgId, ids.anonymousId, ids.deviceId]
    });

    if (!results || results.length === 0 || !results[0].result) {
      throw new Error('Script execution failed');
    }

    const data = results[0].result;

    // Log all endpoint results for debugging
    console.log('[Claude Usage Monitor] === FULL DEBUG ===');
    for (const [key, val] of Object.entries(data)) {
      if (key === 'page') {
        console.log(`[Claude Usage Monitor] page:`, val);
      } else if (val && !val._status && !val._error) {
        console.log(`[Claude Usage Monitor] ${key}:`, JSON.stringify(val, null, 2));
      } else if (val && (val._status || val._error)) {
        console.log(`[Claude Usage Monitor] ${key}: HTTP ${val._status || 'ERR'} (${val._url})`);
      }
    }
    console.log('[Claude Usage Monitor] === END DEBUG ===');

    // 1. Plan Usage (five_hour)
    if (data.usage && data.usage.five_hour) {
      const fh = data.usage.five_hour;
      const pct = Math.round(fh.utilization);
      const resetTime = fh.resets_at;

      updateRing(pct);
      startCountdown(resetTime);
      document.getElementById('resetTime').textContent = formatResetDate(resetTime);
    } else {
      document.getElementById('ringPercent').textContent = 'N/A';
      document.getElementById('countdown').textContent = '--:--:--';
    }

    // 2. Extra Usage
    renderExtraUsage(data);

    // 3. Credit / Spending
    renderCredit(data);

    // Update status
    setStatus('', 'Connected');
    updateLastUpdate();

    // Cache
    chrome.storage.local.set({ cachedData: data, lastUpdate: Date.now() });

  } catch (e) {
    console.error('[Claude Usage Monitor] Fetch error:', e);
    showError(`Failed to fetch: ${e.message}`);

    try {
      const cached = await chrome.storage.local.get(['cachedData', 'lastUpdate']);
      if (cached.cachedData) {
        const data = cached.cachedData;
        if (data.usage && data.usage.five_hour) {
          updateRing(Math.round(data.usage.five_hour.utilization));
          if (data.usage.five_hour.resets_at) startCountdown(data.usage.five_hour.resets_at);
        }
        renderExtraUsage(data);
        renderCredit(data);
        document.getElementById('lastUpdate').textContent =
          `Cached: ${new Date(cached.lastUpdate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
      }
    } catch (ce) {
      console.error('[Claude Usage Monitor] Cache error:', ce);
    }
  }
}

// ─── Event Listeners ───
document.getElementById('refreshBtn').addEventListener('click', fetchUsage);
document.getElementById('openClaudeBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://claude.ai' });
});
document.getElementById('openSettingsBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://claude.ai/settings/usage' });
});

// ─── Init ───
fetchUsage();

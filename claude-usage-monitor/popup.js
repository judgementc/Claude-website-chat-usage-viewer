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
  const circumference = 2 * Math.PI * 34; // r=34
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
    .then(res => res.ok ? res.json() : null)
    .catch(() => null);

  const base = `https://claude.ai/api/organizations/${orgId}`;

  return Promise.all([
    fetchJson(`${base}/usage`),
    fetchJson(`${base}/credit`),
    fetchJson(`${base}/subscription`),
    fetchJson(`${base}/extra_usage`),
    fetchJson(`${base}/metered_usage`),
  ]).then(([usage, credit, subscription, extraUsage, meteredUsage]) => ({
    usage, credit, subscription, extraUsage, meteredUsage
  }));
}

// ─── Render Credit / Billing Section ───
function renderCredit(data) {
  const credit = data.credit;
  if (!credit) {
    console.log('[Claude Usage Monitor] No credit data available');
    return;
  }

  console.log('[Claude Usage Monitor] Credit response:', JSON.stringify(credit, null, 2));

  const card = document.getElementById('billingCard');
  card.classList.remove('hidden');

  // Amount is in minor units (cents) → divide by 100
  const balanceDollars = (credit.amount || 0) / 100;
  document.getElementById('billingBalance').textContent = `$${balanceDollars.toFixed(2)}`;

  // Auto-reload settings
  if (credit.auto_reload_settings && credit.auto_reload_settings.enabled) {
    const tag = document.getElementById('autoReloadTag');
    tag.classList.remove('hidden');
    tag.textContent = 'auto-reload on';
  }

  // Spending limit from auto_reload_settings
  if (credit.auto_reload_settings) {
    const reloadTo = (credit.auto_reload_settings.reload_to_in_minor_units || 0) / 100;
    const threshold = (credit.auto_reload_settings.threshold_in_minor_units || 0) / 100;
    document.getElementById('billingLimit').textContent =
      `Reload to $${reloadTo.toFixed(2)} at $${threshold.toFixed(2)}`;
  }
}

// ─── Render Extra Usage Section ───
function renderExtraUsage(data) {
  // Try dedicated extra_usage endpoint first
  const extraEndpoint = data.extraUsage || data.meteredUsage;
  if (extraEndpoint) {
    console.log('[Claude Usage Monitor] Extra usage endpoint response:', JSON.stringify(extraEndpoint, null, 2));
  }

  // Try to extract from usage response
  const usage = data.usage;
  if (usage) {
    console.log('[Claude Usage Monitor] Usage response keys:', Object.keys(usage));
  }

  // Try subscription data
  const sub = data.subscription;
  if (sub) {
    console.log('[Claude Usage Monitor] Subscription response:', JSON.stringify(sub, null, 2));
  }

  // Attempt to render from any available source
  let spent = null, limit = null, pct = null, resetDate = null;

  // Source 1: dedicated extra_usage endpoint
  if (extraEndpoint) {
    spent = extraEndpoint.spent || extraEndpoint.amount || extraEndpoint.usage_amount;
    limit = extraEndpoint.limit || extraEndpoint.cap || extraEndpoint.spending_limit;
    pct = extraEndpoint.utilization || extraEndpoint.percent_used;
    resetDate = extraEndpoint.resets_at || extraEndpoint.reset_date || extraEndpoint.period_end;

    // Handle minor units
    if (spent !== null && spent > 100) {
      spent = spent / 100;
      if (limit) limit = limit / 100;
    }
  }

  // Source 2: usage.extra_usage (when non-null)
  if (spent === null && usage && usage.extra_usage) {
    const eu = usage.extra_usage;
    spent = eu.spent || eu.amount || eu.usage_amount;
    limit = eu.limit || eu.cap || eu.spending_limit;
    pct = eu.utilization || eu.percent_used;
    resetDate = eu.resets_at || eu.reset_date || eu.period_end;
  }

  // Source 3: subscription data
  if (spent === null && sub) {
    spent = sub.extra_usage_spent || sub.metered_spend;
    limit = sub.extra_usage_limit || sub.spending_cap;
    resetDate = sub.billing_cycle_end || sub.period_end;
  }

  if (spent !== null && spent !== undefined) {
    const card = document.getElementById('extraUsageCard');
    card.classList.remove('hidden');

    limit = limit || 40; // Default Pro spending limit
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
    console.log('[Claude Usage Monitor] No extra usage data found in any endpoint');
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
    console.log('[Claude Usage Monitor] All API data:', data);

    // 1. Plan Usage (five_hour)
    if (data.usage && data.usage.five_hour) {
      const fh = data.usage.five_hour;
      const pct = Math.round(fh.utilization);
      const resetTime = fh.resets_at;

      updateRing(pct);
      startCountdown(resetTime);
      document.getElementById('resetTime').textContent = formatResetDate(resetTime);
    } else {
      console.warn('[Claude Usage Monitor] No five_hour data in usage response');
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

    // Try cache
    try {
      const cached = await chrome.storage.local.get(['cachedData', 'lastUpdate']);
      if (cached.cachedData) {
        const data = cached.cachedData;

        if (data.usage && data.usage.five_hour) {
          const pct = Math.round(data.usage.five_hour.utilization);
          updateRing(pct);
          if (data.usage.five_hour.resets_at) startCountdown(data.usage.five_hour.resets_at);
        }

        renderExtraUsage(data);
        renderCredit(data);

        document.getElementById('lastUpdate').textContent = `Cached: ${new Date(cached.lastUpdate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
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

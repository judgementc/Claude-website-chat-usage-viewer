let countdownInterval = null;

// ─── Cookie Extraction ───
function extractIdsFromCookies(cookies) {
  const result = { orgId: null, anonymousId: null, deviceId: null };
  for (const cookie of cookies) {
    switch (cookie.name) {
      case 'lastActiveOrg':   result.orgId = cookie.value; break;
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

  return Promise.all([
    fetchJson(`https://claude.ai/api/organizations/${orgId}/usage`),
    fetchJson(`https://claude.ai/api/organizations/${orgId}/billing`),
    fetchJson(`https://claude.ai/api/organizations/${orgId}/settings`)
  ]).then(([usage, billing, settings]) => ({ usage, billing, settings }));
}

// ─── Render Extra Usage Section ───
function renderExtraUsage(data) {
  // Try to find extra usage data from the usage response
  const usage = data.usage;
  if (!usage) return;

  // Log full response for debugging
  console.log('[Claude Usage Monitor] Full usage response:', JSON.stringify(usage, null, 2));

  // Look for possible extra usage fields
  const extra = usage.extra_usage || usage.monthly || usage.metered_usage || usage.consumption || null;
  
  if (!extra) {
    // Try to extract from top-level fields
    if (usage.extra_usage_amount !== undefined || usage.monthly_spend !== undefined) {
      showExtraUsageFromFields(usage);
      return;
    }
    console.log('[Claude Usage Monitor] No extra usage data found in response. Available keys:', Object.keys(usage));
    return;
  }

  const card = document.getElementById('extraUsageCard');
  card.classList.remove('hidden');

  const spent = extra.spent || extra.amount || extra.used || 0;
  const limit = extra.limit || extra.cap || extra.monthly_limit || 40;
  const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
  const resetDate = extra.resets_at || extra.reset_date || extra.period_end || null;

  document.getElementById('extraSpent').textContent = `$${spent.toFixed(2)} spent`;
  document.getElementById('extraLimit').textContent = `$${limit.toFixed(2)}`;
  document.getElementById('extraFill').style.width = `${Math.min(pct, 100)}%`;
  document.getElementById('extraPercent').textContent = `${pct}% used`;

  if (resetDate) {
    document.getElementById('extraResetDate').textContent = formatMonthlyReset(resetDate);
    document.getElementById('extraResetBadge').textContent = formatMonthlyReset(resetDate);
  }
}

function showExtraUsageFromFields(usage) {
  const card = document.getElementById('extraUsageCard');
  card.classList.remove('hidden');

  const spent = usage.extra_usage_amount || usage.monthly_spend || 0;
  const limit = usage.extra_usage_limit || usage.spending_limit || 40;
  const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;

  document.getElementById('extraSpent').textContent = `$${Number(spent).toFixed(2)} spent`;
  document.getElementById('extraLimit').textContent = `$${Number(limit).toFixed(2)}`;
  document.getElementById('extraFill').style.width = `${Math.min(pct, 100)}%`;
  document.getElementById('extraPercent').textContent = `${pct}% used`;
}

// ─── Render Billing Section ───
function renderBilling(data) {
  const billing = data.billing;
  const settings = data.settings;

  if (billing) {
    console.log('[Claude Usage Monitor] Full billing response:', JSON.stringify(billing, null, 2));
  }
  if (settings) {
    console.log('[Claude Usage Monitor] Full settings response:', JSON.stringify(settings, null, 2));
  }

  // Try billing endpoint first
  const billingData = billing || settings || null;
  if (!billingData) {
    console.log('[Claude Usage Monitor] No billing data available');
    return;
  }

  const card = document.getElementById('billingCard');

  // Extract balance
  const balance = billingData.balance || billingData.current_balance 
    || billingData.credits || billingData.credit_balance
    || (billingData.billing && billingData.billing.balance)
    || null;

  // Extract spending limit
  const spendingLimit = billingData.spending_limit || billingData.monthly_limit
    || billingData.monthly_spending_limit
    || (billingData.billing && billingData.billing.spending_limit)
    || null;

  // Extract auto-reload status
  const autoReload = billingData.auto_reload || billingData.auto_reload_enabled
    || (billingData.billing && billingData.billing.auto_reload)
    || null;

  if (balance !== null || spendingLimit !== null) {
    card.classList.remove('hidden');

    if (balance !== null) {
      const balStr = typeof balance === 'number' ? `$${balance.toFixed(2)}` : `$${balance}`;
      document.getElementById('billingBalance').textContent = balStr;
    }

    if (spendingLimit !== null) {
      const limStr = typeof spendingLimit === 'number' ? `$${spendingLimit.toFixed(2)}` : `$${spendingLimit}`;
      document.getElementById('billingLimit').textContent = limStr;
    }

    if (autoReload) {
      document.getElementById('autoReloadTag').classList.remove('hidden');
    }
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

    // 3. Billing / Spending Limit
    renderBilling(data);

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
        renderBilling(data);

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

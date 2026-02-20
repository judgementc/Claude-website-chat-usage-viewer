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

// ─── API Call: Usage endpoint ───
function fetchUsageAPI(orgId, anonymousId, deviceId) {
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'anthropic-anonymous-id': anonymousId || '',
    'anthropic-client-platform': 'web_claude_ai',
    'anthropic-client-sha': 'c7b39fd963cf6d1b28a4d1e59433bcc0124e946a',
    'anthropic-client-version': '1.0.0',
    'anthropic-device-id': deviceId || ''
  };

  return fetch(`https://claude.ai/api/organizations/${orgId}/usage`, {
    method: 'GET', credentials: 'include', headers
  }).then(r => r.ok ? r.json() : null).catch(() => null);
}

// ─── Scrape settings/usage page via RSC Flight Data ───
function fetchSettingsRSC() {
  // Next.js App Router uses RSC (React Server Components) for data.
  // When navigating client-side, the browser sends "RSC: 1" header.
  // We replicate this to get the serialized data.
  const rscHeaders = {
    'RSC': '1',
    'Next-Url': '/settings/usage',
    'Accept': 'text/x-component',
  };

  return fetch('https://claude.ai/settings/usage', {
    credentials: 'include',
    headers: rscHeaders
  })
    .then(r => r.text())
    .then(text => {
      console.log('[Claude Usage Monitor] RSC response length:', text.length);
      console.log('[Claude Usage Monitor] RSC first 2000 chars:', text.substring(0, 2000));

      const result = {};

      // Parse credit data: {"amount":NNNN,"currency":"USD","auto_reload_settings":{...}}
      const creditMatch = text.match(/"amount"\s*:\s*(\d+)\s*,\s*"currency"\s*:\s*"(\w+)"\s*,\s*"auto_reload_settings"\s*:\s*(\{[^}]+\})/);
      if (creditMatch) {
        result.credit = {
          amount: parseInt(creditMatch[1]),
          currency: creditMatch[2],
          auto_reload_settings: JSON.parse(creditMatch[3])
        };
      }

      // Fallback: just find amount + currency
      if (!result.credit) {
        const simpleCredit = text.match(/"amount"\s*:\s*(\d+)\s*,\s*"currency"\s*:\s*"(\w+)"/);
        if (simpleCredit) {
          result.credit = { amount: parseInt(simpleCredit[1]), currency: simpleCredit[2] };
          // Try to find auto_reload separately
          const arMatch = text.match(/"auto_reload_settings"\s*:\s*\{[^}]*"enabled"\s*:\s*(true|false)[^}]*\}/);
          if (arMatch) {
            try {
              result.credit.auto_reload_settings = JSON.parse(arMatch[0].replace('"auto_reload_settings":', ''));
            } catch (e) { }
          }
        }
      }

      // Parse extra usage spending data
      // Look for patterns like: spent or usage_amount followed by a number
      const spentPatterns = [
        /\$(\d+\.?\d*)\s*spent/i,
        /"spent"\s*:\s*(\d+\.?\d*)/,
        /"usage_amount"\s*:\s*(\d+\.?\d*)/,
        /"extra_usage_amount"\s*:\s*(\d+\.?\d*)/,
        /"metered_spend"\s*:\s*(\d+\.?\d*)/,
      ];
      for (const pat of spentPatterns) {
        const m = text.match(pat);
        if (m) {
          result.extraSpent = parseFloat(m[1]);
          break;
        }
      }

      // Look for percentage used
      const pctPatterns = [
        /(\d+)%\s*used/i,
        /"percent_used"\s*:\s*(\d+)/,
        /"utilization"\s*:\s*(\d+)/,
      ];
      for (const pat of pctPatterns) {
        const m = text.match(pat);
        if (m) {
          result.extraPct = parseInt(m[1]);
          break;
        }
      }

      // Look for spending limit
      const limitPatterns = [
        /"spending_limit"\s*:\s*(\d+\.?\d*)/,
        /"monthly_limit"\s*:\s*(\d+\.?\d*)/,
        /"extra_usage_limit"\s*:\s*(\d+\.?\d*)/,
      ];
      for (const pat of limitPatterns) {
        const m = text.match(pat);
        if (m) {
          result.extraLimit = parseFloat(m[1]);
          break;
        }
      }

      // Look for reset dates
      const resetPatterns = [
        /"resets_at"\s*:\s*"([^"]+)"/,
        /"reset_date"\s*:\s*"([^"]+)"/,
        /"period_end"\s*:\s*"([^"]+)"/,
        /"billing_cycle_end"\s*:\s*"([^"]+)"/,
      ];
      for (const pat of resetPatterns) {
        const m = text.match(pat);
        if (m) {
          result.resetDate = m[1];
          break;
        }
      }

      return result;
    })
    .catch(e => {
      console.log('[Claude Usage Monitor] RSC fetch error:', e.message);
      return {};
    });
}

// ─── Scrape the DOM if on settings/usage page ───
function scrapeSettingsDOM() {
  // Only works if the current page IS settings/usage
  if (!window.location.pathname.includes('/settings/usage')) {
    return null;
  }

  console.log('[Claude Usage Monitor] On settings/usage page, scraping DOM...');
  const result = {};
  const body = document.body.innerText;

  // Find "$X.XX spent"
  const spentMatch = body.match(/\$(\d+\.?\d*)\s*spent/i);
  if (spentMatch) result.extraSpent = parseFloat(spentMatch[1]);

  // Find "X% used"
  const pctMatch = body.match(/(\d+)%\s*used/i);
  if (pctMatch) result.extraPct = parseInt(pctMatch[1]);

  // Find "Resets Mon DD"
  const resetMatch = body.match(/Resets\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)/i);
  if (resetMatch) result.resetText = resetMatch[0];

  // Find credit/balance amounts
  const dollarMatches = body.match(/\$\d+\.\d{2}/g);
  if (dollarMatches) result.dollarAmounts = dollarMatches;

  // Find auto-reload
  if (body.includes('auto-reload') || body.includes('Auto-reload') || body.includes('auto_reload')) {
    result.hasAutoReload = true;
    result.autoReloadOn = body.includes('auto-reload on') || body.includes('Auto-reload on');
  }

  return result;
}

// ─── Master function: executed in page context ───
function executeInPage(orgId, anonymousId, deviceId) {
  return Promise.all([
    fetchUsageAPI(orgId, anonymousId, deviceId),
    fetchSettingsRSC(),
    Promise.resolve(scrapeSettingsDOM()),
  ]).then(([usage, rsc, dom]) => ({ usage, rsc, dom }));
}

// ─── Render Credit Section ───
function renderCredit(data) {
  let creditAmount = null;
  let autoReload = null;

  // Source 1: RSC data
  if (data.rsc && data.rsc.credit) {
    creditAmount = data.rsc.credit.amount / 100;
    autoReload = data.rsc.credit.auto_reload_settings;
  }

  // Source 2: DOM scraping
  if (creditAmount === null && data.dom && data.dom.dollarAmounts) {
    // The largest dollar amount is likely the balance
    const amounts = data.dom.dollarAmounts.map(s => parseFloat(s.replace('$', '')));
    if (amounts.length > 0) {
      creditAmount = Math.max(...amounts);
      if (data.dom.autoReloadOn) autoReload = { enabled: true };
    }
  }

  if (creditAmount !== null) {
    const card = document.getElementById('billingCard');
    card.classList.remove('hidden');
    document.getElementById('billingBalance').textContent = `$${creditAmount.toFixed(2)}`;

    if (autoReload && autoReload.enabled) {
      document.getElementById('autoReloadTag').classList.remove('hidden');
    }

    if (autoReload && autoReload.reload_to_in_minor_units) {
      const reloadTo = autoReload.reload_to_in_minor_units / 100;
      const threshold = (autoReload.threshold_in_minor_units || 0) / 100;
      document.getElementById('billingLimit').textContent =
        `Reload to $${reloadTo.toFixed(2)} at $${threshold.toFixed(2)}`;
    }
  } else {
    console.log('[Claude Usage Monitor] No credit data found');
  }
}

// ─── Render Extra Usage Section ───
function renderExtraUsage(data) {
  let spent = null, limit = null, pct = null, resetText = null;

  // Source 1: RSC data
  if (data.rsc) {
    if (data.rsc.extraSpent !== undefined) spent = data.rsc.extraSpent;
    if (data.rsc.extraPct !== undefined) pct = data.rsc.extraPct;
    if (data.rsc.extraLimit !== undefined) limit = data.rsc.extraLimit;
    if (data.rsc.resetDate) resetText = formatMonthlyReset(data.rsc.resetDate);
  }

  // Source 2: usage.extra_usage (when non-null)
  if (spent === null && data.usage && data.usage.extra_usage) {
    const eu = data.usage.extra_usage;
    spent = eu.spent || eu.amount;
    limit = eu.limit || eu.cap;
    pct = eu.utilization;
    if (eu.resets_at) resetText = formatMonthlyReset(eu.resets_at);
  }

  // Source 3: DOM scraping
  if (spent === null && data.dom) {
    if (data.dom.extraSpent !== undefined) spent = data.dom.extraSpent;
    if (data.dom.extraPct !== undefined) pct = data.dom.extraPct;
    if (data.dom.resetText) resetText = data.dom.resetText;
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

    if (resetText) {
      document.getElementById('extraResetDate').textContent = resetText;
      document.getElementById('extraResetBadge').textContent = resetText;
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

    // Debug
    console.log('[Claude Usage Monitor] Usage:', data.usage ? JSON.stringify(data.usage, null, 2) : 'null');
    console.log('[Claude Usage Monitor] RSC parsed:', JSON.stringify(data.rsc, null, 2));
    console.log('[Claude Usage Monitor] DOM scraped:', JSON.stringify(data.dom, null, 2));

    // 1. Plan Usage
    if (data.usage && data.usage.five_hour) {
      const fh = data.usage.five_hour;
      updateRing(Math.round(fh.utilization));
      startCountdown(fh.resets_at);
      document.getElementById('resetTime').textContent = formatResetDate(fh.resets_at);
    } else {
      document.getElementById('ringPercent').textContent = 'N/A';
      document.getElementById('countdown').textContent = '--:--:--';
    }

    // 2. Extra Usage
    renderExtraUsage(data);

    // 3. Credit
    renderCredit(data);

    setStatus('', 'Connected');
    updateLastUpdate();
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

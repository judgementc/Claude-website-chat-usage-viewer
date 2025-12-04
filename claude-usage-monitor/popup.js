let countdownInterval = null;

// 从cookies中提取必要的ID
function extractIdsFromCookies(cookies) {
  const result = {
    orgId: null,
    anonymousId: null,
    deviceId: null
  };
  
  for (const cookie of cookies) {
    switch (cookie.name) {
      case 'lastActiveOrg':
        result.orgId = cookie.value;
        break;
      case 'ajs_anonymous_id':
        result.anonymousId = cookie.value;
        break;
      case 'anthropic-device-id':
        result.deviceId = cookie.value;
        break;
    }
  }
  
  return result;
}

function getUsageColor(utilization) {
  if (utilization >= 90) return '#ef4444';
  if (utilization >= 70) return '#f59e0b';
  if (utilization >= 50) return '#eab308';
  return '#4ade80';
}

function formatCountdown(resetTime) {
  const now = new Date();
  const reset = new Date(resetTime);
  const diff = reset - now;
  
  if (diff <= 0) return '即将重置...';
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatResetTime(resetTime) {
  const reset = new Date(resetTime);
  return `重置于 ${reset.toLocaleString('zh-CN', { 
    month: 'numeric', 
    day: 'numeric',
    hour: '2-digit', 
    minute: '2-digit'
  })}`;
}

function startCountdown(resetTime) {
  if (countdownInterval) clearInterval(countdownInterval);
  
  const countdownEl = document.getElementById('countdown');
  
  const updateCountdown = () => {
    const text = formatCountdown(resetTime);
    countdownEl.textContent = text;
    
    // 根据剩余时间改变颜色
    const now = new Date();
    const reset = new Date(resetTime);
    const diff = reset - now;
    const hours = diff / (1000 * 60 * 60);
    
    if (hours < 1) {
      countdownEl.style.color = '#4ade80';
    } else if (hours < 2) {
      countdownEl.style.color = '#fbbf24';
    } else {
      countdownEl.style.color = '#f87171';
    }
  };
  
  updateCountdown();
  countdownInterval = setInterval(updateCountdown, 1000);
}

function setStatus(status) {
  const dot = document.getElementById('statusDot');
  dot.className = 'status-dot ' + status;
}

function showError(message) {
  const errorEl = document.getElementById('error');
  errorEl.textContent = message;
  errorEl.classList.add('show');
  setStatus('error');
}

function hideError() {
  const errorEl = document.getElementById('error');
  errorEl.classList.remove('show');
}

function updateLastUpdate() {
  const el = document.getElementById('lastUpdate');
  el.textContent = `更新于 ${new Date().toLocaleTimeString('zh-CN')}`;
}

// 在页面上下文中执行的函数
function executeInPage(orgId, anonymousId, deviceId) {
  return fetch(`https://claude.ai/api/organizations/${orgId}/usage`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'anthropic-anonymous-id': anonymousId || '',
      'anthropic-client-platform': 'web_claude_ai',
      'anthropic-client-sha': 'c7b39fd963cf6d1b28a4d1e59433bcc0124e946a',
      'anthropic-client-version': '1.0.0',
      'anthropic-device-id': deviceId || ''
    }
  })
  .then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
}

async function fetchUsage() {
  hideError();
  setStatus('loading');
  
  try {
    // 获取所有claude.ai的cookies
    const cookies = await chrome.cookies.getAll({ domain: 'claude.ai' });
    const ids = extractIdsFromCookies(cookies);
    
    if (!ids.orgId) {
      showError('请先登录 claude.ai');
      return;
    }
    
    // 查找claude.ai标签页
    const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
    
    if (tabs.length === 0) {
      showError('请先打开 claude.ai 页面');
      return;
    }
    
    // 在页面上下文中执行请求
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: executeInPage,
      args: [ids.orgId, ids.anonymousId, ids.deviceId]
    });
    
    if (!results || results.length === 0 || results[0].result === undefined) {
      throw new Error('执行失败');
    }
    
    const data = results[0].result;
    
    if (data.five_hour) {
      const utilization = Math.round(data.five_hour.utilization);
      const remaining = 100 - utilization;
      const resetTime = data.five_hour.resets_at;
      
      // 更新进度条
      const fillEl = document.getElementById('usageFill');
      fillEl.style.width = `${Math.max(utilization, 8)}%`;
      fillEl.style.background = getUsageColor(utilization);
      fillEl.textContent = `${utilization}%`;
      
      // 更新剩余百分比
      document.getElementById('remaining').textContent = remaining;
      
      // 更新重置时间
      document.getElementById('resetTime').textContent = formatResetTime(resetTime);
      
      // 启动倒计时
      startCountdown(resetTime);
      
      // 更新状态
      setStatus('');
      updateLastUpdate();
      
      // 缓存数据
      chrome.storage.local.set({ 
        usage: data, 
        lastUpdate: Date.now() 
      });
    } else {
      throw new Error('无法获取使用量数据');
    }
  } catch (e) {
    console.error('Fetch error:', e);
    showError(`获取失败: ${e.message}`);
    
    // 尝试使用缓存数据
    try {
      const cached = await chrome.storage.local.get(['usage', 'lastUpdate']);
      if (cached.usage && cached.usage.five_hour) {
        const utilization = Math.round(cached.usage.five_hour.utilization);
        const remaining = 100 - utilization;
        
        const fillEl = document.getElementById('usageFill');
        fillEl.style.width = `${Math.max(utilization, 8)}%`;
        fillEl.style.background = getUsageColor(utilization);
        fillEl.textContent = `${utilization}%`;
        
        document.getElementById('remaining').textContent = remaining;
        document.getElementById('lastUpdate').textContent = 
          `缓存于 ${new Date(cached.lastUpdate).toLocaleTimeString('zh-CN')}`;
      }
    } catch (cacheError) {
      console.error('Cache error:', cacheError);
    }
  }
}

// 打开Claude页面
function openClaude() {
  chrome.tabs.create({ url: 'https://claude.ai' });
}

// 事件绑定
document.getElementById('refreshBtn').addEventListener('click', fetchUsage);
document.getElementById('openClaudeBtn').addEventListener('click', openClaude);

// 初始加载
fetchUsage();

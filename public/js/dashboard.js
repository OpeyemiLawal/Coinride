(function() {

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const SOL_RPC = 'https://api.devnet.solana.com';

  const addressEl       = document.getElementById('dashAddress');
  const solBalanceEl    = document.getElementById('dashSolBalance');
  const rideBalanceEl   = document.getElementById('dashRideBalance');
  const predHistBody    = document.getElementById('dashPredHistory');
  const claimListEl     = document.getElementById('dashClaimList');
  const claimTotalEl    = document.getElementById('dashClaimTotal');
  const claimAllBtn     = document.getElementById('dashClaimAllBtn');
  const toastEl         = document.getElementById('dashToast');
  const disconnectBtn   = document.getElementById('dashDisconnectBtn');
  const predCountEl     = document.getElementById('dashPredCount');
  const claimCountEl    = document.getElementById('dashClaimCount');
  const loadingEl       = document.getElementById('dashLoading');
  const contentEl       = document.getElementById('dashContent');

  let RPC = SOL_RPC;
  let RIDE_TOKEN_MINT = '';

  const PRED_PER_PAGE = 5;
  const CLAIM_PER_PAGE = 5;
  let predPage = 1;
  let claimPage = 1;
  let recs = [];

  let toastTimer;

  function showToast(msg, isError) {
    toastEl.textContent = msg;
    toastEl.className = 'toast' + (isError ? ' error' : '');
    toastEl.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 4000);
  }

  function shortenAddress(addr) {
    if (!addr || addr.length < 10) return addr || '';
    return addr.slice(0, 4) + '...' + addr.slice(-4);
  }

  function renderPagination(containerId, currentPage, totalPages, onChange) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (totalPages === 0) {
      el.innerHTML = '';
      return;
    }
    if (totalPages === 1) {
      el.innerHTML = '<div class="page-single">Page 1</div>';
      return;
    }
    el.innerHTML = `
      <button class="page-btn page-prev"${currentPage <= 1 ? ' disabled' : ''}>&#9664; Prev</button>
      <span class="page-info">Page ${currentPage} of ${totalPages}</span>
      <button class="page-btn page-next"${currentPage >= totalPages ? ' disabled' : ''}>Next &#9654;</button>
    `;
    el.querySelector('.page-prev').addEventListener('click', () => {
      if (currentPage > 1) onChange(currentPage - 1);
    });
    el.querySelector('.page-next').addEventListener('click', () => {
      if (currentPage < totalPages) onChange(currentPage + 1);
    });
  }

  async function rpcCall(method, params) {
    const token = API.getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch('/api/user/rpc', {
      method: 'POST',
      headers,
      body: JSON.stringify({ method, params }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.result;
  }

  async function fetchBalances(address) {
    const token = API.getToken();
    try {
      const res = await fetch('/api/user/wallet-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': 'Bearer ' + token } : {}) },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to fetch wallet balances');
      return { sol: data.sol, ride: data.ride, balanceErrors: data.balanceErrors || {} };
    } catch (e) {
      console.warn('fetchBalances error:', e.message);
      return { sol: null, ride: null };
    }
  }

  async function render() {
    const wallet = localStorage.getItem('cr_wallet');
    const token = API.getToken();

    if (!wallet || !token) {
      window.location.href = 'index.html';
      return;
    }

    addressEl.textContent = shortenAddress(wallet);

    // Show content immediately with skeleton/cached values
    loadingEl.classList.add('hidden');
    contentEl.style.display = '';
    solBalanceEl.textContent = '--';
    rideBalanceEl.textContent = '--';

    // Load from localStorage cache first for instant render
    const cachedPreds = JSON.parse(localStorage.getItem('cr_preds') || '[]');
    recs = cachedPreds;
    predCountEl.textContent = recs.length;
    renderPredPage(1);

    // Fire all server calls in parallel — no blocking
    const [
      configResult,
      balanceResult,
      claimResult,
      predsResult,
    ] = await Promise.allSettled([
      API.getSolanaConfig(),
      fetchBalances(wallet),
      API.getClaimableRewards(),
      API.getPredictions(),
    ]);

    // Apply config
    if (configResult.status === 'fulfilled') {
      RPC = configResult.value.rpcUrl || SOL_RPC;
      RIDE_TOKEN_MINT = configResult.value.rideTokenMint || '';
    }

    // Apply balances
    const isEVM = wallet.startsWith('0x');
    const balanceData = balanceResult.status === 'fulfilled' ? balanceResult.value : { sol: null, ride: null };
    const { sol: solBalance, ride: rideBalance } = balanceData;
    const displayRideBalance = rideBalance;
    const balanceErrors = balanceData.balanceErrors || {};

    // SOL balance: EVM wallets don't have a Solana address, show 'N/A'
    solBalanceEl.textContent = isEVM
      ? 'N/A (EVM)'
      : (solBalance !== null && solBalance !== undefined ? solBalance.toFixed(6) + ' SOL' : '--');
    // RIDE balance: use DB balance for EVM wallets (earned in-game, stored in DB)
    rideBalanceEl.textContent = displayRideBalance !== null && displayRideBalance !== undefined
      ? displayRideBalance.toFixed(displayRideBalance < 1 ? 4 : 2) + ' RIDE'
      : '--';
    if (balanceErrors.sol || balanceErrors.ride || balanceResult.status === 'rejected') {
      showToast('Some wallet balances could not be loaded. Check RPC and token mint settings.', true);
    }


    // Apply predictions (prefer server data)
    if (predsResult.status === 'fulfilled' && predsResult.value) {
      recs = predsResult.value;
      predCountEl.textContent = recs.length;
      renderPredPage(1);
    }

    // Apply claimable rewards
    const claimData = claimResult.status === 'fulfilled' ? claimResult.value : { items: [], total: 0 };
    const claimItems = claimData.items || [];
    const claimTotal = claimData.total || 0;
    claimCountEl.textContent = claimItems.length;
    claimTotalEl.textContent = claimTotal.toFixed(claimTotal < 1 ? 4 : 2) + ' RIDE';
    renderClaimPage(1, claimItems);

    // Resolve predictions in background (don't block render)
    API.resolvePredictions().catch(() => {});
  }

  function renderPredPage(page) {
    const totalPages = recs.length ? Math.ceil(recs.length / PRED_PER_PAGE) : 0;
    if (page < 1) page = 1;
    if (page > totalPages && totalPages > 0) page = totalPages;
    predPage = page;

    const start = (page - 1) * PRED_PER_PAGE;
    const pageRecs = recs.slice(start, start + PRED_PER_PAGE);

    if (recs.length === 0) {
      predHistBody.innerHTML = '<tr><td colspan="6" class="dashboard-empty">No predictions yet.</td></tr>';
    } else {
      predHistBody.innerHTML = pageRecs.map(r => {
        const statusClass = r.hit === true ? 'status-hit' : r.hit === false ? 'status-miss' : 'status-pending';
        const statusText = r.hit === true ? 'Hit' : r.hit === false ? 'Miss' : 'Pending';
        const dirText = r.direction.charAt(0).toUpperCase() + r.direction.slice(1);
        const dirSymbol = r.direction === 'up' ? '\u25B2' : '\u25BC';
        const rawEntry = r.entry_price !== undefined && r.entry_price !== null ? r.entry_price : r.entryPrice;
        const entryP = rawEntry !== undefined && rawEntry !== null ? Number(rawEntry) : 0;
        const fmtP = v => v < 1 ? '$' + v.toFixed(4) : '$' + v.toFixed(2);
        const rawPct = r.target_pct !== undefined ? r.target_pct : r.targetPct;
        const pct = rawPct !== undefined && rawPct !== null ? Number(rawPct) : 0;
        const targetPrice = pct > 0 && entryP > 0 ? entryP * (1 + (r.direction === 'up' ? 1 : -1) * pct / 100) : null;
        const targetStr = targetPrice ? fmtP(targetPrice) + (r.direction === 'up' ? '+' : '-') : (pct > 0 ? (r.direction === 'up' ? '\u2191 +' : '\u2193 -') + pct + '%' : '--');
        const created = r.created_at || r.createdAt;
        const dateStr = created
          ? new Date(created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          : '--';
        const rewardStr = r.claimed
          ? '<span class="reward-claimed">Claimed</span>'
          : r.hit
            ? '<span class="reward-value">' + r.reward + ' RIDE</span>'
            : '<span class="reward-none">--</span>';
        return `<tr>
            <td class="td-coin"><span class="coin-badge">${esc(r.coin)}</span></td>
            <td class="td-date">${dateStr}</td>
            <td class="td-pred">${dirSymbol} ${dirText}</td>
            <td class="td-target">${targetStr}</td>
            <td class="td-status"><span class="status-pill ${statusClass}">${statusText}</span></td>
            <td class="td-reward">${rewardStr}</td>
          </tr>`;
      }).join('');
    }
    renderPagination('predPagination', page, totalPages, (newPage) => {
      renderPredPage(newPage);
    });
  }

  let currentClaimItems = [];

  function renderClaimPage(page, items) {
    if (items !== undefined) currentClaimItems = items;
    const claimItems = currentClaimItems;
    const totalPages = claimItems.length ? Math.ceil(claimItems.length / CLAIM_PER_PAGE) : 0;
    if (page < 1) page = 1;
    if (page > totalPages && totalPages > 0) page = totalPages;
    claimPage = page;

    const start = (page - 1) * CLAIM_PER_PAGE;
    const pageItems = claimItems.slice(start, start + CLAIM_PER_PAGE);

    if (claimItems.length === 0) {
      claimListEl.innerHTML = '<p class="dashboard-empty">No rewards to claim.</p>';
      claimAllBtn.disabled = true;
      claimAllBtn.textContent = 'Nothing to Airdrop';
      claimAllBtn.classList.add('claim-all-disabled');
    } else {
      claimListEl.innerHTML = pageItems.map(item => `
          <div class="claim-item">
            <div class="claim-info">
              <span class="claim-coin">${esc(item.label)}</span>
              <span class="claim-amount">+${item.amount} RIDE</span>
            </div>
          </div>
        `).join('');

      claimAllBtn.disabled = false;
      claimAllBtn.textContent = 'Airdrop to Wallet';
      claimAllBtn.classList.remove('claim-all-disabled');

      claimAllBtn.onclick = async () => {
        claimAllBtn.disabled = true;
        claimAllBtn.innerHTML = '<span class="spinner"></span> Airdropping...';
        try {
          const result = await API.claimAll();
          showToast('Claimed +' + result.amount + ' RIDE! Signature: ' + result.signature.slice(0, 8) + '...');
          render();
        } catch (err) {
          console.error('Airdrop claim failed:', err.message);
          showToast('Claim failed: ' + err.message, true);
          claimAllBtn.disabled = false;
          claimAllBtn.textContent = 'Airdrop to Wallet';
          claimAllBtn.classList.remove('claim-all-disabled');
        }
      };
    }
    renderPagination('claimPagination', page, totalPages, (newPage) => {
      renderClaimPage(newPage);
    });
  }


  disconnectBtn.addEventListener('click', () => {
    // Clear all session and cooldown data
    [
      'cr_wallet', 'cr_wallet_type',
      'cr_daily_preds', 'cr_ticker_cooldowns',
      'cr_preds', 'cr_preds_state',
      'cr_used_assets', 'cr_ride', 'cr_unclaimed', 'cr_unlocked',
    ].forEach(k => localStorage.removeItem(k));
    API.clearToken();
    showToast('Wallet disconnected');
    setTimeout(() => { window.location.href = 'index.html'; }, 500);
  });

  render();

  // Auto-refresh predictions every 30s in background
  setInterval(async () => {
    try {
      API.resolvePredictions().catch(() => {});
      const fresh = await API.getPredictions().catch(() => null);
      if (fresh) {
        recs = fresh;
        predCountEl.textContent = recs.length;
        renderPredPage(1);
      }
    } catch (_) {}
  }, 30000);

})();

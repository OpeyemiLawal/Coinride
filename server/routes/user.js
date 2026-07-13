const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { authMiddleware } = require('../middleware/auth');

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
  ]);
}

const activeClaims = new Set();

const COIN_ID_MAP = {
  btc: 'bitcoin', eth: 'ethereum', sol: 'solana', doge: 'dogecoin',
  ada: 'cardano', xrp: 'ripple', dot: 'polkadot', avax: 'avalanche-2',
  matic: 'polygon', pol: 'polygon', link: 'chainlink', ltc: 'litecoin',
  bch: 'bitcoin-cash', xlm: 'stellar', uni: 'uniswap', xmr: 'monero',
  trx: 'tron', fil: 'filecoin', apt: 'aptos', arb: 'arbitrum',
  op: 'optimism', sui: 'sui', near: 'near', icp: 'internet-computer',
  atom: 'cosmos', algo: 'algorand', vet: 'vechain', theta: 'theta-token',
  aave: 'aave', mkr: 'maker', comp: 'compound-governance-token',
  mana: 'decentraland', sand: 'the-sandbox', axs: 'axie-infinity',
  xtz: 'tezos', eos: 'eos', neo: 'neo', flow: 'flow', hbar: 'hedera-hashgraph',
  kava: 'kava', celo: 'celo', hnt: 'helium', cake: 'pancakeswap',
  gala: 'gala', imx: 'immutable-x', rndr: 'render-token', fet: 'fetch-ai',
  inj: 'injective-protocol',
};

// ── Public chart proxy endpoints (no auth required) ──

// In-memory cache for chart data (60s TTL)
const chartCache = {};

// GET /api/user/chart - multi-source chart data (CoinGecko → Bybit → Binance)
// Accepts coinId (CoinGecko) or ticker (for Bybit/Binance)
router.get('/chart', async (req, res) => {
  const { coinId, ticker, days } = req.query;
  if (!coinId && !ticker) return res.status(400).json({ error: 'coinId or ticker required' });

  const key = coinId || ticker;
  const cacheKey = `${key}:${days || 90}`;
  const cached = chartCache[cacheKey];
  if (cached && Date.now() - cached.ts < 60000) {
    return res.json(cached.data);
  }

  const symbol = (ticker || coinId || '').toUpperCase();

  // Source 1: CoinGecko (if coinId provided)
  if (coinId) {
    try {
      let url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days || 90}`;
      if (days !== 'max') url += '&interval=daily';
      const apiRes = await fetch(url);
      if (apiRes.ok) {
        const data = await apiRes.json();
        chartCache[cacheKey] = { data, ts: Date.now() };
        return res.json(data);
      }
    } catch (_) {}
  }

  // Source 2: Bybit klines
  try {
    const limit = days === 'max' ? 200 : Math.min(200, Math.ceil((days || 90)) + 10);
    const bybitRes = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}USDT&interval=D&limit=${limit}`);
    if (bybitRes.ok) {
      const bybitData = await bybitRes.json();
      if (bybitData.result && bybitData.result.list && bybitData.result.list.length > 0) {
        const list = bybitData.result.list.reverse();
        const prices = list.map(k => [parseInt(k[0]), parseFloat(k[4])]);
        const data = { prices };
        chartCache[cacheKey] = { data, ts: Date.now() };
        return res.json(data);
      }
    }
  } catch (_) {}

  // Source 3: Binance klines
  try {
    const limit = days === 'max' ? 500 : Math.min(500, Math.ceil((days || 90)) + 10);
    const binRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=1d&limit=${limit}`);
    if (binRes.ok) {
      const binData = await binRes.json();
      if (Array.isArray(binData) && binData.length > 0) {
        const prices = binData.map(k => [k[0], parseFloat(k[4])]);
        const data = { prices };
        chartCache[cacheKey] = { data, ts: Date.now() };
        return res.json(data);
      }
    }
  } catch (_) {}

  // CoinMarketCap — no historical OHLCV on free tier, skip

  res.status(404).json({ error: 'No chart data available for ' + (key) });
});

// GET /api/user/yahoo-chart - proxy for Yahoo Finance chart data with caching
router.get('/yahoo-chart', async (req, res) => {
  const { ticker, range } = req.query;
  if (!ticker) return res.status(400).json({ error: 'ticker required' });

  const cacheKey = `yh:${ticker}:${range || '3mo'}`;
  const cached = chartCache[cacheKey];
  if (cached && Date.now() - cached.ts < 60000) {
    return res.json(cached.data);
  }

  try {
    const r = range || '3mo';
    const apiRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker.toUpperCase())}?range=${r}&interval=1d`);
    if (!apiRes.ok) {
      return res.status(apiRes.status).json({ error: 'Yahoo API error ' + apiRes.status });
    }
    const data = await apiRes.json();
    chartCache[cacheKey] = { data, ts: Date.now() };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/user/coin-search - proxy for CoinGecko's coin search (public, no auth).
// The browser can't call api.coingecko.com directly because Helmet's default
// CSP only allows connect-src 'self'; routing it through our own origin fixes
// ticker search/autocomplete for any coin outside the hardcoded ~40-coin map.
router.get('/coin-search', async (req, res) => {
  const { query } = req.query;
  if (!query || typeof query !== 'string') return res.status(400).json({ error: 'query required' });
  try {
    const apiRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`);
    if (!apiRes.ok) return res.status(apiRes.status).json({ error: 'CoinGecko search error' });
    res.json(await apiRes.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── All routes below require auth ──
router.use(authMiddleware);

// GET /api/user/balance
router.get('/balance', async (req, res) => {
  const { wallet } = req.user;
  const { data, error } = await supabase
    .from('users')
    .select('ride_balance')
    .eq('wallet', wallet)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ rideBalance: (data && data.ride_balance) || 0 });
});

// GET /api/user/predictions
router.get('/predictions', async (req, res) => {
  const { wallet } = req.user;
  const { data, error } = await supabase
    .from('predictions')
    .select('*')
    .eq('wallet', wallet)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/user/predictions — save a new prediction
router.post('/predictions', async (req, res) => {
  const { wallet } = req.user;
  const { coin, direction, targetPct, entryPrice, reward } = req.body;

  if (!coin || typeof coin !== 'string' || !/^[A-Za-z0-9]{1,20}$/.test(coin)) {
    return res.status(400).json({ error: 'Invalid coin ticker' });
  }
  if (!direction || !['up', 'down'].includes(direction)) {
    return res.status(400).json({ error: 'direction must be "up" or "down"' });
  }
  if (targetPct != null && (typeof targetPct !== 'number' || targetPct < 0.1 || targetPct > 100)) {
    return res.status(400).json({ error: 'targetPct must be between 0.1 and 100' });
  }
  if (entryPrice != null && (typeof entryPrice !== 'number' || entryPrice <= 0)) {
    return res.status(400).json({ error: 'entryPrice must be a positive number' });
  }
  if (reward != null && (typeof reward !== 'number' || reward <= 0 || reward > 1000000)) {
    return res.status(400).json({ error: 'Invalid reward amount' });
  }

  // Check ticker cooldown (duplicate prediction within 12h)
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .from('ticker_cooldowns')
    .select('id')
    .eq('wallet', wallet)
    .eq('ticker', coin.toLowerCase())
    .gte('created_at', cutoff)
    .maybeSingle();

  if (existing) return res.status(409).json({ error: 'Already predicted this coin recently' });

  // Insert prediction and ticker cooldown in parallel for speed
  const [{ data, error }] = await Promise.all([
    supabase
      .from('predictions')
      .insert({
        wallet,
        coin,
        direction,
        target_pct: targetPct || 0,
        entry_price: entryPrice || 0,
        exit_price: 0,
        hit: null,
        reward: reward || 10000,
      })
      .select()
      .single(),
    supabase.from('ticker_cooldowns').insert({
      wallet,
      ticker: coin.toLowerCase(),
    }).then(() => {}).catch(() => {}),
  ]);

  if (error) return res.status(500).json({ error: error.message });

  res.status(201).json(data);
});

const coinIdCache = {};

async function fetchCurrentPrice(coin) {
  const cleanCoin = coin.trim().toLowerCase();
  const symbol = cleanCoin.toUpperCase();

  // Primary: Bybit V5 Spot (free, unlimited, 600+ coins)
  try {
    const res = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}USDT`);
    if (res.ok) {
      const data = await res.json();
      if (data.result && data.result.list && data.result.list[0] && data.result.list[0].lastPrice) {
        return parseFloat(data.result.list[0].lastPrice);
      }
    }
  } catch (_) {}

  // Fallback: Binance
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`);
    if (res.ok) {
      const data = await res.json();
      if (data.price != null) return parseFloat(data.price);
    }
  } catch (_) {}

  // Fallback: CoinGecko (via hardcoded map or search + resolve)
  let coinId = COIN_ID_MAP[cleanCoin] || coinIdCache[cleanCoin];
  if (!coinId) {
    try {
      const searchRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(cleanCoin)}`);
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const coins = searchData.coins || [];
        const match = coins.find(c => c.symbol.toLowerCase() === cleanCoin) ||
                      coins.find(c => c.name.toLowerCase() === cleanCoin) ||
                      coins[0];
        if (match) {
          coinId = match.id;
          coinIdCache[cleanCoin] = match.id;
        }
      }
    } catch (_) {}
  }

  if (coinId) {
    for (const id of [coinId, cleanCoin]) {
      try {
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
        if (res.ok) {
          const data = await res.json();
          if (data[id] && data[id].usd != null) return data[id].usd;
        } else if (res.status === 429) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
      } catch (_) {}
      try {
        const res = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=1`);
        if (res.ok) {
          const data = await res.json();
          if (data.prices && data.prices.length > 0) return data.prices[data.prices.length - 1][1];
        } else if (res.status === 429) {
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (_) {}
    }
  }

  // Fallback: CoinMarketCap
  const cmcKey = process.env.CMC_API_KEY;
  if (cmcKey) {
    try {
      const res = await fetch(`https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${symbol}`, {
        headers: { 'X-CMC_PRO_API_KEY': cmcKey }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data && data.data[symbol] && data.data[symbol].quote && data.data[symbol].quote.USD) {
          return parseFloat(data.data[symbol].quote.USD.price);
        }
      }
    } catch (_) {}
  }

  return null;
}

router.post('/resolve-predictions', async (req, res) => {
  const { wallet } = req.user;
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const { data: pending, error } = await supabase
    .from('predictions')
    .select('id, coin, direction, entry_price, target_pct')
    .eq('wallet', wallet)
    .is('hit', null)
    .lt('created_at', cutoff);

  if (error) return res.status(500).json({ error: error.message });
  if (!pending || pending.length === 0) return res.json({ resolved: 0 });

  const uniqueCoins = [...new Set(pending.map(p => p.coin.toLowerCase()))];
  const prices = {};
  for (const c of uniqueCoins) {
    prices[c] = await fetchCurrentPrice(c);
    // Stock tickers (≥4 chars, all-alpha) — try Yahoo as fallback
    if (prices[c] == null && /^[a-z]{1,5}$/.test(c)) {
      try {
        const yRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${c}?interval=1d&range=1d`);
        if (yRes.ok) {
          const yData = await yRes.json();
          const meta = yData?.chart?.result?.[0]?.meta;
          if (meta && meta.regularMarketPrice != null) prices[c] = meta.regularMarketPrice;
        }
      } catch (_) {}
    }
    await new Promise(r => setTimeout(r, 600));
  }

  let resolved = 0;
  for (const p of pending) {
    const currentPrice = prices[p.coin.toLowerCase()];
    if (currentPrice == null) continue;
    if (!p.entry_price || p.entry_price === 0) continue;
    const changePct = ((currentPrice - p.entry_price) / p.entry_price) * 100;
    const target = p.target_pct || 0;
    const hit = p.direction === 'up' ? changePct >= target : changePct <= -target;
    const { error: updateErr } = await supabase
      .from('predictions')
      .update({ hit, exit_price: currentPrice })
      .eq('id', p.id);
    if (!updateErr) resolved++;
  }

  res.json({ resolved });
});

// Max reward per asset, mirrors ASSETS in public/js/game.js — server-side ceiling
// so a client can't submit an arbitrary reward value.
const ASSET_MAX_REWARD = {
  scooter: 100,
  rabbit: 500,
  sports: 1000,
  solana: 2500,
  pump: 5000,
  monster: 10000,
};

// POST /api/user/ride/claim — record ride reward for on-chain claiming
router.post('/ride/claim', async (req, res) => {
  const { wallet } = req.user;
  const { coin, reward, assetId, recordPrediction, durationSeconds, captchaToken } = req.body;

  if (!coin || typeof reward !== 'number' || !/^[A-Za-z0-9]{1,20}$/.test(coin)) {
    return res.status(400).json({ error: 'Invalid coin/reward' });
  }

  const shouldVerifyCaptcha = () => {
    if (process.env.NODE_ENV !== 'production') return false;
    const host = req.headers.host || '';
    if (host.includes('localhost') || host.includes('127.0.0.1')) return false;
    return true;
  };

  if (shouldVerifyCaptcha()) {
    if (!captchaToken) {
      return res.status(400).json({ error: 'Captcha token required' });
    }

    // Verify Turnstile captcha
    try {
      const form = new URLSearchParams();
      form.append('secret', process.env.TURNSTILE_SECRET_KEY);
      form.append('response', captchaToken);
      const verRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', body: form,
      });
      const verData = await verRes.json();
      if (!verData.success) {
        console.warn('Turnstile ride claim verification failed:', verData['error-codes'] || verData);
        return res.status(403).json({ error: 'Captcha verification failed' });
      }
    } catch (_) {
      return res.status(500).json({ error: 'Captcha verification error' });
    }
  }

  const ceiling = ASSET_MAX_REWARD[assetId] || ASSET_MAX_REWARD.scooter;
  if (reward < 0 || reward > ceiling) {
    return res.status(400).json({ error: `Invalid reward amount for asset "${assetId || 'scooter'}" (max ${ceiling})` });
  }

  const usedAssetId = assetId || 'scooter';

  // Anti-farming guard 1: this asset must not already be on cooldown for this
  // ticker (mirrors the 12h cooldown the client enforces, but authoritative
  // here so a script can't just skip the client and call claim in a loop).
  const cooldownCutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const { data: onCooldown } = await supabase
    .from('asset_cooldowns')
    .select('id')
    .eq('wallet', wallet)
    .eq('asset_id', usedAssetId)
    .eq('ticker', coin)
    .gte('created_at', cooldownCutoff)
    .maybeSingle();

  if (onCooldown) {
    return res.status(429).json({ error: 'This asset is on cooldown for this ticker' });
  }

  // Anti-farming guard 2: per-wallet daily earning cap across all ride rewards.
  const dayCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: todaysRewards } = await supabase
    .from('ride_rewards')
    .select('reward')
    .eq('wallet', wallet)
    .gte('created_at', dayCutoff);
  const todayTotal = (todaysRewards || []).reduce((sum, r) => sum + r.reward, 0);
  const DAILY_RIDE_CAP = 2000;
  if (reward > 0 && todayTotal + reward > DAILY_RIDE_CAP) {
    return res.status(429).json({ error: `Daily ride-reward cap reached (${DAILY_RIDE_CAP} RIDE/24h)` });
  }

  // Record ride reward for later on-chain claim, and start the cooldown for
  // this asset+ticker in the same request so the two can't be raced apart.
  if (reward > 0) {
    const row = { wallet, ticker: coin, asset_id: usedAssetId, reward, claimed: false };
    const dur = typeof durationSeconds === 'number' && durationSeconds > 0 ? Math.round(durationSeconds) : 0;
    let error;

    if (dur > 0) {
      // Try with duration_seconds — column may not exist yet
      ({ error } = await supabase.from('ride_rewards').insert({ ...row, duration_seconds: dur }));
      if (error) {
        // Column missing — retry without it
        ({ error } = await supabase.from('ride_rewards').insert(row));
      }
    } else {
      ({ error } = await supabase.from('ride_rewards').insert(row));
    }

    if (error) return res.status(500).json({ error: error.message });

    await supabase
      .from('asset_cooldowns')
      .upsert(
        { wallet, asset_id: usedAssetId, ticker: coin, created_at: new Date().toISOString() },
        { onConflict: 'wallet,asset_id,ticker' }
      );
  }

  // Record ticker cooldown if this ride was with a prediction (prediction counts now)
  if (recordPrediction) {
    await supabase
      .from('ticker_cooldowns')
      .upsert({ wallet, ticker: coin.toLowerCase(), created_at: new Date().toISOString() }, { onConflict: 'wallet,ticker' });
  }

  res.json({ success: true, reward });
});

// POST /api/user/prediction/claim — claim prediction reward
router.post('/prediction/claim', async (req, res) => {
  const { wallet } = req.user;
  const { predId } = req.body;

  if (!predId) return res.status(400).json({ error: 'predId required' });

  // Atomically update the prediction as claimed if it belongs to the user, was a hit, and is not yet claimed
  const { data: updatedPred, error } = await supabase
    .from('predictions')
    .update({ claimed: true })
    .eq('id', predId)
    .eq('wallet', wallet)
    .eq('hit', true)
    .eq('claimed', false)
    .select('id, reward')
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!updatedPred) {
    return res.status(400).json({ error: 'Prediction not found, not a hit, or already claimed' });
  }

  res.json({ success: true, reward: updatedPred.reward });
});

// POST /api/user/wallet-balance — fetch SOL + RIDE balances via web3.js Connection
router.post('/wallet-balance', async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'address required' });

  // EVM addresses (MetaMask, etc.) don't have SOL or Solana RIDE balances
  if (address.startsWith('0x')) {
    return res.json({ sol: null, ride: null, evm: true });
  }

  try {
    const solana = require('../solana');
    const [solResult, rideResult] = await Promise.allSettled([
      solana.getSolBalance(address),
      solana.getTokenBalance(address),
    ]);
    const balanceErrors = {};
    if (solResult.status === 'rejected') balanceErrors.sol = solResult.reason.message;
    if (rideResult.status === 'rejected') balanceErrors.ride = rideResult.reason.message;
    // Return partial data even when the RPC provider is unavailable.
    res.json({
      sol: solResult.status === 'fulfilled' ? solResult.value : null,
      ride: rideResult.status === 'fulfilled' ? rideResult.value : null,
      ...(Object.keys(balanceErrors).length ? { balanceErrors } : {}),
    });
  } catch (err) {
    console.error('wallet-balance error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/user/sync-balance — sync DB ride_balance to match on-chain RIDE balance,
// and also return unclaimed rewards total so the frontend can compute effective balance.
router.post('/sync-balance', async (req, res) => {
  const { wallet } = req.user;
  try {
    // Fetch unclaimed rewards total (always applicable regardless of wallet type)
    const [predRes, rideRes] = await Promise.all([
      supabase.from('predictions').select('reward').eq('wallet', wallet).eq('hit', true).eq('claimed', false),
      supabase.from('ride_rewards').select('reward').eq('wallet', wallet).eq('claimed', false),
    ]);
    const unclaimedTotal = (
      (predRes.data || []).reduce((s, p) => s + p.reward, 0) +
      (rideRes.data || []).reduce((s, r) => s + r.reward, 0)
    );

    // EVM wallets (MetaMask etc.) don't have on-chain Solana RIDE balance to sync
    if (wallet.startsWith('0x')) {
      // Just return the DB balance as-is
      const { data: userData } = await supabase.from('users').select('ride_balance').eq('wallet', wallet).single();
      const rideBalance = userData?.ride_balance || 0;
      return res.json({ rideBalance, unclaimedTotal, evm: true });
    }

    const solana = require('../solana');
    const onChainBalance = await solana.getTokenBalance(wallet);
    const { error } = await supabase
      .from('users')
      .update({ ride_balance: onChainBalance })
      .eq('wallet', wallet);
    if (error) {
      console.error('sync-balance DB update error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    res.json({ rideBalance: onChainBalance, unclaimedTotal });
  } catch (err) {
    console.error('sync-balance error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// POST /api/user/rpc — proxy Solana RPC calls (avoids browser CORS)
router.post('/rpc', async (req, res) => {
  const { method, params } = req.body;
  const allowedMethods = new Set([
    'getAccountInfo',
    'getBalance',
    'getLatestBlockhash',
    'getTokenAccountBalance',
    'getTokenAccountsByOwner',
    'getTokenSupply',
  ]);
  if (!allowedMethods.has(method)) {
    return res.status(400).json({ error: 'RPC method not allowed' });
  }
  const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
  try {
    const rpcRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const data = await rpcRes.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/user/test/seed-hits — mark recent predictions as hits for testing
// Debug-only: disabled unless explicitly enabled.
router.post('/test/seed-hits', async (req, res) => {
  if (process.env.ALLOW_TEST_ENDPOINTS !== 'true') {
    return res.status(404).json({ error: 'Not found' });
  }
  const { wallet } = req.user;
  const { data } = await supabase
    .from('predictions')
    .select('id')
    .eq('wallet', wallet)
    .eq('hit', false)
    .eq('claimed', false)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!data || data.length === 0) return res.json({ updated: 0 });

  const ids = data.map(p => p.id);
  const { error } = await supabase
    .from('predictions')
    .update({ hit: true, reward: 10000 })
    .in('id', ids);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ updated: ids.length });
});

// GET /api/user/solana-config — expose RPC and token mint to client
router.get('/solana-config', (req, res) => {
  res.json({
    rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
    rideTokenMint: process.env.RIDE_TOKEN_MINT || '',
  });
});

// GET /api/user/claimable-rewards — unclaimed prediction rewards + ride records
router.get('/claimable-rewards', async (req, res) => {
  const { wallet } = req.user;

  const { data: preds, error: predErr } = await supabase
    .from('predictions')
    .select('id, coin, direction, reward, created_at')
    .eq('wallet', wallet)
    .eq('hit', true)
    .eq('claimed', false);

  if (predErr) return res.status(500).json({ error: predErr.message });

  // Unclaimed ride rewards
  const { data: rides, error: rideErr } = await supabase
    .from('ride_rewards')
    .select('id, asset_id, ticker, reward, created_at')
    .eq('wallet', wallet)
    .eq('claimed', false);

  if (rideErr) return res.status(500).json({ error: rideErr.message });

  const items = [];

  (preds || []).forEach(p => {
    const coinFormatted = p.coin.toUpperCase();
    items.push({
      id: 'pred_' + p.id,
      source: 'prediction',
      label: `12-Hour ${coinFormatted} Prediction`,
      amount: p.reward,
      createdAt: p.created_at,
    });
  });

  (rides || []).forEach(r => {
    const coinFormatted = r.ticker.toUpperCase();
    const assetFormatted = r.asset_id ? r.asset_id.charAt(0).toUpperCase() + r.asset_id.slice(1).toLowerCase() : 'Scooter';
    items.push({
      id: 'ride_' + r.id,
      source: 'ride',
      label: `${coinFormatted} Chart ${assetFormatted} Ride`,
      amount: r.reward,
      createdAt: r.created_at,
    });
  });

  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = items.reduce((sum, i) => sum + i.amount, 0);
  res.json({ items, total });
});

// POST /api/user/claim-all — transfer all rewards via Solana treasury tx
router.post('/claim-all', async (req, res) => {
  const { wallet } = req.user;
  if (wallet.startsWith('0x')) {
    return res.status(400).json({ error: 'Airdrop requires a Solana wallet.' });
  }
  if (activeClaims.has(wallet)) {
    return res.status(409).json({ error: 'Airdrop already in progress. Please wait.' });
  }
  activeClaims.add(wallet);

  try {
    // 1. Fetch eligible predictions and rides to target their specific IDs
    const [predRes, rideRes] = await Promise.all([
      supabase.from('predictions').select('id, reward').eq('wallet', wallet).eq('hit', true).eq('claimed', false),
      supabase.from('ride_rewards').select('id, reward').eq('wallet', wallet).eq('claimed', false),
    ]);

  if (predRes.error) return res.status(500).json({ error: predRes.error.message });
  if (rideRes.error) return res.status(500).json({ error: rideRes.error.message });

  const predIds = (predRes.data || []).map(p => p.id);
  const rideIds = (rideRes.data || []).map(r => r.id);

  if (predIds.length === 0 && rideIds.length === 0) {
    return res.status(400).json({ error: 'Nothing to claim' });
  }

  if (!process.env.TREASURY_SECRET_KEY) {
    return res.status(500).json({ error: 'Treasury not configured' });
  }

  const total = (predRes.data || []).reduce((s, p) => s + Number(p.reward || 0), 0) +
                (rideRes.data || []).reduce((s, r) => s + Number(r.reward || 0), 0);

  if (total <= 0) {
    return res.status(400).json({ error: 'Nothing to claim' });
  }

  // Transfer first. Only mark rewards claimed after the chain confirms.
  // This prevents failed/timeout airdrops from disappearing from the dashboard.
  const solana = require('../solana');
  const sig = await withTimeout(
      solana.transferTokens(wallet, total),
      35000,
      'Solana transfer timed out',
  );

    const [claimPredRes, claimRideRes] = await Promise.all([
      predIds.length > 0
        ? supabase
            .from('predictions')
            .update({ claimed: true })
            .in('id', predIds)
            .eq('wallet', wallet)
            .eq('hit', true)
            .eq('claimed', false)
        : Promise.resolve({ error: null }),
      rideIds.length > 0
        ? supabase
            .from('ride_rewards')
            .update({ claimed: true })
            .in('id', rideIds)
            .eq('wallet', wallet)
            .eq('claimed', false)
        : Promise.resolve({ error: null }),
    ]);

    if (claimPredRes.error || claimRideRes.error) {
      console.error('claim-all post-transfer DB update failed:', claimPredRes.error || claimRideRes.error);
      return res.status(500).json({
        error: 'Airdrop sent, but rewards could not be marked claimed. Contact support with signature: ' + sig,
        signature: sig,
      });
    }

    // Sync DB ride_balance to match on-chain balance after transfer
    try {
      const onChainBalance = await solana.getTokenBalance(wallet);
      await supabase.from('users').update({ ride_balance: onChainBalance }).eq('wallet', wallet);
    } catch (e) {
      console.warn('claim-all: failed to sync balance after transfer:', e.message);
    }

    res.json({ success: true, amount: total, signature: sig });
  } catch (err) {
    console.error('claim-all failed:', err.message);
    res.status(500).json({ error: 'Blockchain transfer failed: ' + err.message });
  } finally {
    activeClaims.delete(wallet);
  }
});

// GET /api/user/used-assets
router.get('/used-assets', async (req, res) => {
  const { wallet } = req.user;
  const { data, error } = await supabase
    .from('asset_cooldowns')
    .select('asset_id, ticker, created_at')
    .eq('wallet', wallet);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/user/used-assets — mark asset as used on ticker (12h cooldown)
router.post('/used-assets', async (req, res) => {
  const { wallet } = req.user;
  const { assetId, ticker } = req.body;

  if (!assetId || !ticker) {
    return res.status(400).json({ error: 'assetId and ticker required' });
  }

  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  // Check if still on cooldown
  const { data: active } = await supabase
    .from('asset_cooldowns')
    .select('id')
    .eq('wallet', wallet)
    .eq('asset_id', assetId)
    .eq('ticker', ticker)
    .gte('created_at', cutoff)
    .maybeSingle();

  if (active) {
    return res.json({ success: true, alreadyUsed: true });
  }

  // Upsert the cooldown entry
  const { error } = await supabase
    .from('asset_cooldowns')
    .upsert(
      { wallet, asset_id: assetId, ticker, created_at: new Date().toISOString() },
      { onConflict: 'wallet,asset_id,ticker' }
    );

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ success: true });
});

// GET /api/user/unlocked-assets
router.get('/unlocked-assets', async (req, res) => {
  const { wallet } = req.user;
  const { data, error } = await supabase
    .from('users')
    .select('unlocked_assets')
    .eq('wallet', wallet)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  res.json((data && data.unlocked_assets) || []);
});

// POST /api/user/unlock — unlock an asset
router.post('/unlock', async (req, res) => {
  const { wallet } = req.user;
  const { assetId } = req.body;

  if (!assetId || !ASSET_MAX_REWARD[assetId]) {
    return res.status(400).json({ error: 'Invalid assetId' });
  }

  const { data: user } = await supabase
    .from('users')
    .select('unlocked_assets')
    .eq('wallet', wallet)
    .maybeSingle();

  const current = (user && user.unlocked_assets) || [];
  if (current.includes(assetId)) {
    return res.json({ success: true, alreadyUnlocked: true });
  }

  const { error } = await supabase
    .from('users')
    .update({ unlocked_assets: [...current, assetId] })
    .eq('wallet', wallet);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// GET /api/user/pred-state — prediction count and tickers in the last 12h
router.get('/pred-state', async (req, res) => {
  const { wallet } = req.user;
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('ticker_cooldowns')
    .select('ticker')
    .eq('wallet', wallet)
    .gte('created_at', cutoff);

  if (error) return res.status(500).json({ error: error.message });
  const tickers = [...new Set((data || []).map(r => r.ticker))];
  res.json({ count: tickers.length, tickers });
});

// GET /api/user/profile — aggregated user data
router.get('/profile', async (req, res) => {
  const { wallet } = req.user;
  const [userRes, usedRes, predRes] = await Promise.all([
    supabase.from('users').select('ride_balance, unlocked_assets').eq('wallet', wallet).maybeSingle(),
    supabase.from('asset_cooldowns').select('asset_id, ticker, created_at').eq('wallet', wallet),
    supabase.from('ticker_cooldowns').select('ticker').eq('wallet', wallet).gte('created_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()),
  ]);

  if (userRes.error) return res.status(500).json({ error: userRes.error.message });

  const tickers = [...new Set((predRes.data || []).map(r => r.ticker))];
  res.json({
    wallet,
    rideBalance: (userRes.data && userRes.data.ride_balance) || 0,
    unlockedAssets: (userRes.data && userRes.data.unlocked_assets) || [],
    usedAssets: (usedRes.data || []).map(r => ({ assetId: r.asset_id, ticker: r.ticker, createdAt: r.created_at })),
    predCount: tickers.length,
    predTickers: tickers,
  });
});

module.exports = router;

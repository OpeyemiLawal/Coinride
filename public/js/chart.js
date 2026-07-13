// chart.js
// Fetches chart data and converts it directly into rideable terrain vertices.
// The ride terrain is the chart polyline itself: one candle/point becomes one vertex.

const ChartModule = (() => {
  const TIMEFRAMES = {
    '3M': { days: 90, interval: 'daily' },
    '6M': { days: 180, interval: 'daily' },
    '1Y': { days: 365, interval: 'daily' },
    'ALL': { days: 'max', interval: 'daily' }
  };

  let activeTimeframe = '3M';
  let onTimeframeChangeCallback = null;
  let canvas = null;
  let tooltipEl = null;
  let currentSeries = [];

  function getCurrentSeries() { return currentSeries; }

  let hoverIndex = -1;
  let onRedrawCallback = null;

  const PAD_LEFT = 60;
  const PAD_RIGHT = 20;

  function init(canvasEl, tooltipElement) {
    canvas = canvasEl;
    tooltipEl = tooltipElement;

    canvas.addEventListener('mousemove', handlePointerMove);
    canvas.addEventListener('mouseleave', hideTooltip);
    canvas.addEventListener('touchstart', handleTouchMove, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', hideTooltip);
  }

  function setTimeframe(tf) {
    if (!TIMEFRAMES[tf]) return;
    activeTimeframe = tf;
    if (onTimeframeChangeCallback) onTimeframeChangeCallback(tf);
  }

  function onTimeframeChange(cb) {
    onTimeframeChangeCallback = cb;
  }

  function getActiveTimeframe() {
    return activeTimeframe;
  }

  function setCurrentSeries(series) {
    currentSeries = series;
    hoverIndex = -1;
  }

  const coinList = [
    { id: 'bitcoin',       symbols: ['btc'], name: 'Bitcoin', isStock: false },
    { id: 'ethereum',      symbols: ['eth'], name: 'Ethereum', isStock: false },
    { id: 'solana',        symbols: ['sol'], name: 'Solana', isStock: false },
    { id: 'dogecoin',      symbols: ['doge'], name: 'Dogecoin', isStock: false },
    { id: 'cardano',       symbols: ['ada'], name: 'Cardano', isStock: false },
    { id: 'ripple',        symbols: ['xrp'], name: 'XRP', isStock: false },
    { id: 'polkadot',      symbols: ['dot'], name: 'Polkadot', isStock: false },
    { id: 'avalanche-2',   symbols: ['avax'], name: 'Avalanche', isStock: false },
    { id: 'polygon',       symbols: ['matic', 'pol'], name: 'Polygon', isStock: false },
    { id: 'chainlink',     symbols: ['link'], name: 'Chainlink', isStock: false },
    { id: 'litecoin',      symbols: ['ltc'], name: 'Litecoin', isStock: false },
    { id: 'bitcoin-cash',  symbols: ['bch'], name: 'Bitcoin Cash', isStock: false },
    { id: 'stellar',       symbols: ['xlm'], name: 'Stellar', isStock: false },
    { id: 'uniswap',       symbols: ['uni'], name: 'Uniswap', isStock: false },
    { id: 'monero',        symbols: ['xmr'], name: 'Monero', isStock: false },
    { id: 'tron',          symbols: ['trx'], name: 'TRON', isStock: false },
    { id: 'filecoin',      symbols: ['fil'], name: 'Filecoin', isStock: false },
    { id: 'aptos',         symbols: ['apt'], name: 'Aptos', isStock: false },
    { id: 'arbitrum',      symbols: ['arb'], name: 'Arbitrum', isStock: false },
    { id: 'optimism',      symbols: ['op'], name: 'Optimism', isStock: false },
    { id: 'sui',           symbols: ['sui'], name: 'Sui', isStock: false },
    { id: 'near',          symbols: ['near'], name: 'NEAR Protocol', isStock: false },
    { id: 'internet-computer', symbols: ['icp'], name: 'Internet Computer', isStock: false },
    { id: 'cosmos',        symbols: ['atom'], name: 'Cosmos', isStock: false },
    { id: 'algorand',      symbols: ['algo'], name: 'Algorand', isStock: false },
    { id: 'vechain',       symbols: ['vet'], name: 'VeChain', isStock: false },
    { id: 'theta-token',   symbols: ['theta'], name: 'Theta Network', isStock: false },
    { id: 'aave',          symbols: ['aave'], name: 'Aave', isStock: false },
    { id: 'maker',         symbols: ['mkr'], name: 'Maker', isStock: false },
    { id: 'compound-governance-token', symbols: ['comp'], name: 'Compound', isStock: false },
    { id: 'decentraland',  symbols: ['mana'], name: 'Decentraland', isStock: false },
    { id: 'the-sandbox',   symbols: ['sand'], name: 'The Sandbox', isStock: false },
    { id: 'axie-infinity', symbols: ['axs'], name: 'Axie Infinity', isStock: false },
    { id: 'tezos',         symbols: ['xtz'], name: 'Tezos', isStock: false },
    { id: 'eos',           symbols: ['eos'], name: 'EOS', isStock: false },
    { id: 'neo',           symbols: ['neo'], name: 'NEO', isStock: false },
    { id: 'flow',          symbols: ['flow'], name: 'Flow', isStock: false },
    { id: 'hedera-hashgraph', symbols: ['hbar'], name: 'Hedera', isStock: false },
    { id: 'kava',          symbols: ['kava'], name: 'Kava', isStock: false },
    { id: 'celo',          symbols: ['celo'], name: 'Celo', isStock: false },
    { id: 'helium',        symbols: ['hnt'], name: 'Helium', isStock: false },
    { id: 'pancakeswap',   symbols: ['cake'], name: 'PancakeSwap', isStock: false },
    { id: 'gala',          symbols: ['gala'], name: 'Gala', isStock: false },
    { id: 'immutable-x',   symbols: ['imx'], name: 'Immutable', isStock: false },
    { id: 'render-token',  symbols: ['rndr'], name: 'Render', isStock: false },
    { id: 'fetch-ai',      symbols: ['fet'], name: 'Fetch.ai', isStock: false },
    { id: 'injective-protocol', symbols: ['inj'], name: 'Injective', isStock: false },
  ];

  const stockList = [
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'MSFT', name: 'Microsoft Corp.' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.' },
    { symbol: 'GOOG', name: 'Alphabet Inc. C' },
    { symbol: 'AMZN', name: 'Amazon.com Inc.' },
    { symbol: 'NVDA', name: 'NVIDIA Corp.' },
    { symbol: 'META', name: 'Meta Platforms Inc.' },
    { symbol: 'TSLA', name: 'Tesla Inc.' },
    { symbol: 'BRK.B', name: 'Berkshire Hathaway B' },
    { symbol: 'JPM', name: 'JPMorgan Chase & Co.' },
    { symbol: 'V', name: 'Visa Inc.' },
    { symbol: 'WMT', name: 'Walmart Inc.' },
    { symbol: 'JNJ', name: 'Johnson & Johnson' },
    { symbol: 'MA', name: 'Mastercard Inc.' },
    { symbol: 'PG', name: 'Procter & Gamble Co.' },
    { symbol: 'XOM', name: 'Exxon Mobil Corp.' },
    { symbol: 'UNH', name: 'UnitedHealth Group' },
    { symbol: 'HD', name: 'Home Depot Inc.' },
    { symbol: 'CVX', name: 'Chevron Corp.' },
    { symbol: 'CRM', name: 'Salesforce Inc.' },
    { symbol: 'ADBE', name: 'Adobe Inc.' },
    { symbol: 'NFLX', name: 'Netflix Inc.' },
    { symbol: 'AMD', name: 'Advanced Micro Devices' },
    { symbol: 'INTC', name: 'Intel Corp.' },
    { symbol: 'PYPL', name: 'PayPal Holdings' },
    { symbol: 'DIS', name: 'Walt Disney Co.' },
    { symbol: 'KO', name: 'Coca-Cola Co.' },
    { symbol: 'PEP', name: 'PepsiCo Inc.' },
    { symbol: 'BAC', name: 'Bank of America' },
    { symbol: 'NKE', name: 'Nike Inc.' },
    { symbol: 'MCD', name: "McDonald's Corp." },
    { symbol: 'COIN', name: 'Coinbase Global Inc.' },
    { symbol: 'SNAP', name: 'Snap Inc.' },
    { symbol: 'UBER', name: 'Uber Technologies' },
    { symbol: 'SQ', name: 'Block Inc.' },
    { symbol: 'SPY', name: 'SPDR S&P 500 ETF' },
    { symbol: 'QQQ', name: 'Invesco QQQ Trust' },
    { symbol: 'IWM', name: 'iShares Russell 2000' },
    { symbol: 'GME', name: 'GameStop Corp.' },
    { symbol: 'AMC', name: 'AMC Entertainment' },
    { symbol: 'PLTR', name: 'Palantir Technologies' },
    { symbol: 'RBLX', name: 'Roblox Corp.' },
    { symbol: 'HOOD', name: 'Robinhood Markets' },
  ];

  const tickerMap = {};
  coinList.forEach(c => c.symbols.forEach(s => { tickerMap[s] = c.id; }));

  const stockSymbols = new Set(stockList.map(s => s.symbol.toLowerCase()));

  let lastSearchCache = JSON.parse(localStorage.getItem('cr_idcache') || '{}');

  function saveSearchCache() {
    localStorage.setItem('cr_idcache', JSON.stringify(lastSearchCache));
  }

  async function resolveCoinId(ticker) {
    if (tickerMap[ticker]) return tickerMap[ticker];
    if (lastSearchCache[ticker]) return lastSearchCache[ticker];

    try {
      const searchRes = await fetch(`/api/user/coin-search?query=${encodeURIComponent(ticker)}`);
      if (!searchRes.ok) return null;
      const searchData = await searchRes.json();
      const coins = searchData.coins || [];
      const match = coins.find(c => c.symbol.toLowerCase() === ticker) ||
                    coins.find(c => c.name.toLowerCase() === ticker) ||
                    coins[0];
      if (match) {
        lastSearchCache[ticker] = match.id;
        saveSearchCache();
        return match.id;
      }
    } catch (e) {
      console.warn('CoinGecko search failed:', e.message);
    }
    return null;
  }

  function yahooRange() {
    const map = { '3M': '3mo', '6M': '6mo', '1Y': '1y', 'ALL': 'max' };
    return map[activeTimeframe] || '3mo';
  }

  async function fetchYahooChart(ticker) {
    const range = yahooRange();
    const res = await fetch(`/api/user/yahoo-chart?ticker=${encodeURIComponent(ticker)}&range=${range}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Yahoo API error ' + res.status);
    }
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) throw new Error('No data from Yahoo');

    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const series = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] !== null && closes[i] !== undefined) {
        series.push({ time: timestamps[i] * 1000, price: closes[i] });
      }
    }
    if (series.length < 2) throw new Error('Not enough stock data');
    setCurrentSeries(series);
    return series.map(p => p.price);
  }

  async function fetchPriceData(coin) {
    const cleanCoin = coin.trim().toLowerCase();

    // Known stock ticker → Yahoo directly
    if (stockSymbols.has(cleanCoin)) {
      try {
        return await fetchYahooChart(cleanCoin);
      } catch (_) {}
    }

    // Known crypto ticker → CoinGecko directly
    const coinId = tickerMap[cleanCoin] || await resolveCoinId(cleanCoin);
    if (coinId) {
      try {
        const tf = TIMEFRAMES[activeTimeframe];
        const res = await fetch(`/api/user/chart?coinId=${coinId}&ticker=${cleanCoin}&days=${tf.days}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'API error ' + res.status);
        }
        const data = await res.json();
        const rawPoints = Array.isArray(data.prices) ? data.prices : [];
        const series = rawPoints
          .filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]))
          .map(point => ({ time: point[0], price: point[1] }));

        if (series.length < 2) throw new Error('Not enough points');

        setCurrentSeries(series);
        return series.map(point => point.price);
      } catch (_) {
        // CoinGecko failed, fall through to Bybit/Binance
      }
    }

    // Try Bybit / Binance via chart proxy with ticker
    try {
      const tf = TIMEFRAMES[activeTimeframe];
      const res = await fetch(`/api/user/chart?ticker=${cleanCoin}&days=${tf.days}`);
      if (res.ok) {
        const data = await res.json();
        const rawPoints = Array.isArray(data.prices) ? data.prices : [];
        const series = rawPoints
          .filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]))
          .map(point => ({ time: point[0], price: point[1] }));
        if (series.length >= 2) {
          setCurrentSeries(series);
          return series.map(point => point.price);
        }
      }
    } catch (_) {}

    // Unknown ticker → try Yahoo as fallback
    try {
      const prices = await fetchYahooChart(cleanCoin);
      stockSymbols.add(cleanCoin);
      return prices;
    } catch (e2) {
      throw new Error(`"${coin}" not found. Try a ticker like BTC, ETH, SOL, or AAPL.`);
    }
  }



  function pricesToTerrainVertices(prices, options = {}) {
    if (!prices || prices.length === 0) return [];

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const spacing = options.spacing || 40;
    const canvasHeight = options.canvasHeight || 400;
    const paddingTop = options.paddingTop || Math.max(30, canvasHeight * 0.08);
    const paddingBottom = options.paddingBottom || Math.max(50, canvasHeight * 0.14);
    const availableHeight = Math.max(120, canvasHeight - paddingTop - paddingBottom);
    const firstPrice = Math.max(Math.abs(prices[0]), 1);
    const volatility = range / firstPrice;
    const volatilityScale = Math.log1p(volatility * 10) / Math.log1p(10);
    const verticalUse = clamp(0.35 + volatilityScale * 0.55, 0.35, 0.9);
    const terrainHeight = availableHeight * verticalUse * 3.525;
    const top = paddingTop + (availableHeight - terrainHeight) / 2;
    const bottom = top + terrainHeight;
    
    const PLATFORM_POINTS = 5; // Creates a 200px flat starting platform
    const platformY = bottom - ((prices[0] - min) / range) * terrainHeight;
    
    const vertices = [];
    
    // Add flat platform
    for (let i = 0; i < PLATFORM_POINTS; i++) {
      vertices.push({
        x: i * spacing,
        y: platformY,
        price: prices[0]
      });
    }

    // Add actual chart
    prices.forEach((price, index) => {
      const normalized = (price - min) / range;
      vertices.push({
        x: (index + PLATFORM_POINTS) * spacing,
        y: bottom - normalized * terrainHeight,
        price
      });
    });

    // Add flat ending platform
    const lastPrice = prices[prices.length - 1];
    const lastY = bottom - ((lastPrice - min) / range) * terrainHeight;
    const lastIndexVert = vertices[vertices.length - 1].x;
    for (let i = 1; i <= PLATFORM_POINTS; i++) {
      vertices.push({
        x: lastIndexVert + i * spacing,
        y: lastY,
        price: lastPrice
      });
    }

    return vertices;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function handlePointerMove(e) {
    if (currentSeries.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    updateTooltip(mouseX);
  }

  function handleTouchMove(e) {
    if (currentSeries.length === 0) return;
    if (e.cancelable) e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const touchX = (touch.clientX - rect.left) * scaleX;
    updateTooltip(touchX);
  }

  function onRedraw(cb) {
    onRedrawCallback = cb;
  }

  function triggerRedraw() {
    if (onRedrawCallback) onRedrawCallback();
  }

  function updateTooltip(canvasX) {
    const plotWidth = canvas.width - PAD_LEFT - PAD_RIGHT;
    const plotX = Math.max(0, Math.min(canvasX - PAD_LEFT, plotWidth));
    const index = Math.round((plotX / plotWidth) * (currentSeries.length - 1));
    hoverIndex = Math.max(0, Math.min(index, currentSeries.length - 1));
    showTooltip(hoverIndex, canvasX);
    triggerRedraw();
  }

  function showTooltip(index, x) {
    const point = currentSeries[index];
    if (!point || !tooltipEl) return;

    tooltipEl.innerHTML = `<strong>${formatPrice(point.price)}</strong><span>${formatDate(point.time, true)}</span>`;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const displayX = (x / scaleX) + rect.left - rect.left;

    tooltipEl.style.left = `${displayX}px`;
    tooltipEl.style.top = `${rect.top}px`;
    tooltipEl.classList.remove('hidden');
  }

  function hideTooltip() {
    hoverIndex = -1;
    if (tooltipEl) tooltipEl.classList.add('hidden');
    triggerRedraw();
  }

  function drawHoverMarker(ctx) {
    if (hoverIndex < 0 || hoverIndex >= currentSeries.length) return;

    const plotWidth = canvas.width - PAD_LEFT - PAD_RIGHT;
    const x = PAD_LEFT + (hoverIndex / (currentSeries.length - 1)) * plotWidth;
    const prices = currentSeries.map(point => point.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const padTop = 30;
    const padBottom = 40;
    const plotHeight = canvas.height - padTop - padBottom;
    const normalized = (currentSeries[hoverIndex].price - min) / range;
    const y = padTop + plotHeight - normalized * plotHeight;

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.moveTo(x, padTop);
    ctx.lineTo(x, canvas.height - padBottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.fillStyle = '#00e5a0';
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = '#0d1117';
    ctx.lineWidth = 2;
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  function formatPrice(val) {
    if (val >= 1000) return '$' + val.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (val >= 1) return '$' + val.toFixed(2);
    return '$' + val.toFixed(4);
  }

  function formatDate(timestamp, showYear) {
    const date = new Date(timestamp);
    const options = { month: 'short', day: 'numeric' };
    if (showYear) options.year = 'numeric';
    return date.toLocaleDateString(undefined, options);
  }

  function searchCoins(query) {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 1) return [];

    const scored = [];

    for (const c of coinList) {
      for (const s of c.symbols) {
        if (s.startsWith(q)) {
          scored.push({ symbol: s.toUpperCase(), name: c.name, score: s === q ? 0 : 1 });
          break;
        }
      }
      const nameLower = c.name.toLowerCase();
      if ((nameLower.startsWith(q) || nameLower.includes(q)) && !c.symbols.some(s => s.startsWith(q))) {
        scored.push({ symbol: c.symbols[0].toUpperCase(), name: c.name, score: nameLower.startsWith(q) ? 2 : 3 });
      }
    }

    // Match stocks
    for (const s of stockList) {
      const symLower = s.symbol.toLowerCase();
      if (symLower.startsWith(q)) {
        scored.push({ symbol: s.symbol, name: s.name, score: symLower === q ? 0 : 1 });
      } else if (s.name.toLowerCase().includes(q) && !scored.some(x => x.symbol === s.symbol)) {
        scored.push({ symbol: s.symbol, name: s.name, score: 3 });
      }
    }

    for (const [ticker, id] of Object.entries(lastSearchCache)) {
      if (ticker.startsWith(q) && !scored.some(s => s.symbol.toLowerCase() === ticker)) {
        const niceName = id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        scored.push({ symbol: ticker.toUpperCase(), name: niceName, score: ticker === q ? 0 : 1 });
      }
    }

    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, 5);
  }

  return {
    fetchPriceData,
    pricesToTerrainVertices,
    setTimeframe,
    onTimeframeChange,
    getActiveTimeframe,
    TIMEFRAMES,
    init,
    setCurrentSeries,
    getCurrentSeries,
    drawHoverMarker,
    onRedraw,
    searchCoins
  };
})();

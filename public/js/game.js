(() => {
  Sound.init();

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const connectWalletBtn    = document.getElementById('connectWalletBtn');
  const tickerInput         = document.getElementById('tickerInput');
  const loadChartBtn        = document.getElementById('loadChartBtn');
  const resetRideBtn        = document.getElementById('resetRideBtn');
  const nitroBarFill        = document.getElementById('nitroBarFill');
  const timeframeBtns       = document.querySelectorAll('.timeframe-btn');
  const tooltipEl           = document.getElementById('chartTooltip');

  const distanceScoreEl     = document.getElementById('distanceScore');
  const chartNameText       = document.getElementById('chartNameText');
  const chartTimeframeText  = document.getElementById('chartTimeframeText');
  const currentCoinEl       = document.getElementById('currentCoin');
  const rideStatusEl        = document.getElementById('rideStatus');

  const rideHud             = document.getElementById('rideHud');
  const rideHudCoin         = document.getElementById('rideHudCoin');
  const rideLiveTimer       = document.getElementById('rideLiveTimer');

  const toastEl           = document.getElementById('toast');
  const toastMessageEl    = document.getElementById('toastMessage');
  let toastTimer          = null;

  function showToast(msg, isError) {
    toastMessageEl.textContent = msg;
    toastEl.className = 'toast' + (isError ? ' toast-error' : '');
    toastEl.classList.remove('hidden');
    toastEl.style.animation = 'toastIn 0.3s ease';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.style.animation = 'toastOut 0.3s ease';
      setTimeout(() => toastEl.classList.add('hidden'), 300);
    }, 3500);
  }

  const victoryOverlay     = document.getElementById('victoryOverlay');
  const victoryRetryBtn    = document.getElementById('victoryRetryBtn');
  const victoryNewTrackBtn = document.getElementById('victoryNewTrackBtn');

  let rideStartTime         = null;
  const nitroParticles      = [];
  let nitroSpawnTimer       = 0;

  const predictionBox       = document.getElementById('predictionBox');
  const predQuestion        = document.getElementById('predQuestion');
  const predYesBtn          = document.getElementById('predYes');
  const predNoBtn           = document.getElementById('predNo');

  const readyPrompt         = document.getElementById('readyPrompt');
  const assetOptionsEl      = document.getElementById('assetOptions');
  const confirmRideBtn      = document.getElementById('confirmRideBtn');

  const predResultHud       = document.getElementById('predResultHud');
  const predResultText      = document.getElementById('predResultText');

  // ─────────────────────────────────────────────────────────
  // ASSET CATALOGUE
  // ─────────────────────────────────────────────────────────

  const ASSETS = [
    { id: 'scooter', file: 'assets/scooter.png', label: 'Scooter', unlock: 'free',   multiplier: 1,   rideRequired: 0,   maxReward: 100   },
    { id: 'rabbit',  file: 'assets/rabbit.png',  label: 'Rabbit',  unlock: 'earned', multiplier: 5,   rideRequired: 0,   maxReward: 500   },
    { id: 'sports',  file: 'assets/sports.png',  label: 'Sports',  unlock: 'ride',   multiplier: 10,  rideRequired: 10000,  maxReward: 1000  },
    { id: 'solana',  file: 'assets/solana.png',  label: 'Solana',  unlock: 'ride',   multiplier: 25,  rideRequired: 100000, maxReward: 2500  },
    { id: 'pump',    file: 'assets/pump.png',    label: 'Pump',    unlock: 'ride',   multiplier: 50,  rideRequired: 250000, maxReward: 5000  },
    { id: 'monster', file: 'assets/monster.png', label: 'Monster', unlock: 'ride',   multiplier: 100, rideRequired: 500000, maxReward: 10000 },
  ];

  let selectedAssetId = 'scooter';
  const assetImages = {};

  const homeImage = new Image();
  homeImage.src = 'assets/home.png';

  const startFlagImg = new Image();
  startFlagImg.src = 'assets/startflag.png';
  const finishFlagImg = new Image();
  finishFlagImg.src = 'assets/finishflag.png';

  ASSETS.forEach(b => {
    const img = new Image();
    img.src = b.file;
    assetImages[b.id] = img;
  });

  function formatRideAmount(n) {
    if (n >= 1000000) return (n / 1000000) + 'M RIDE';
    if (n >= 1000)    return (n / 1000) + 'K RIDE';
    return n + ' RIDE';
  }

  function buildAssetSelector() {
    assetOptionsEl.innerHTML = '';
    ASSETS.forEach(b => {
      const unlocked = isAssetUnlocked(b.id);
      const onCooldown = currentCoin && isAssetOnCooldown(b.id, currentCoin);
      const available = currentCoin ? isAssetAvailable(b.id, currentCoin) : unlocked;
      const scooterNeeded = unlocked && b.id !== 'scooter' && b.unlock !== 'ride' && currentCoin && !isAssetOnCooldown('scooter', currentCoin);
      const opt = document.createElement('div');
      const cls = 'asset-option' +
        (b.id === selectedAssetId ? ' selected' : '') +
        (!available ? ' locked' : '');
      opt.className = cls;
      opt.dataset.id = b.id;

      let badge = '';
      if (onCooldown) {
        badge = '<span class="lock-badge">\u23F3 Cooldown</span>';
      } else if (scooterNeeded) {
        badge = '<span class="lock-badge">\u{1F512} Ride Scooter first</span>';
      } else if (!unlocked) {
        const reqLabel = b.unlock === 'ride' ? `HOLD ${formatRideAmount(b.rideRequired)}` : 'Earn it';
        badge = `<span class="lock-badge">${b.unlock === 'ride' ? reqLabel : '\u{1F512} ' + reqLabel}</span>`;
      }

      opt.innerHTML = `<img src="${b.file}" alt="${b.label}" /><span>${b.label}</span><small>${b.multiplier}x</small>${badge}`;

      opt.addEventListener('click', () => {
        if (!available) return;
        selectedAssetId = b.id;
        document.querySelectorAll('.asset-option').forEach(el => el.classList.remove('selected'));
        opt.classList.add('selected');
      });
      assetOptionsEl.appendChild(opt);
    });
  }

  const unlockedAssets = new Set(
    JSON.parse(localStorage.getItem('cr_unlocked') || '["scooter"]')
  );

  function saveAssetUnlocks() {
    localStorage.setItem('cr_unlocked', JSON.stringify([...unlockedAssets]));
  }

  let rideBalance = +(localStorage.getItem('cr_ride') || '0');
  let unclaimedRewards = +(localStorage.getItem('cr_unclaimed') || '0');
  function saveRideBalance() {
    localStorage.setItem('cr_ride', String(rideBalance));
  }
  function saveUnclaimedRewards() {
    localStorage.setItem('cr_unclaimed', String(unclaimedRewards));
  }
  function getEffectiveBalance() {
    return rideBalance + unclaimedRewards;
  }

  async function syncFromServer() {
    if (!walletAddress || !API.getToken()) return;
    try {
      // Run syncBalance and getProfile in parallel
      const [syncResult, profile] = await Promise.all([
        API.syncBalance().catch(() => null),
        API.getProfile(),
      ]);
      rideBalance = syncResult ? syncResult.rideBalance : profile.rideBalance;
      saveRideBalance();
      if (syncResult && typeof syncResult.unclaimedTotal === 'number') {
        unclaimedRewards = syncResult.unclaimedTotal;
        saveUnclaimedRewards();
      }
      const serverUnlocked = profile.unlockedAssets || [];
      if (serverUnlocked.length > 0) {
        unlockedAssets.clear();
        serverUnlocked.forEach(a => unlockedAssets.add(a));
        localStorage.setItem('cr_unlocked', JSON.stringify([...unlockedAssets]));
      }
      const serverUsed = profile.usedAssets || [];
      if (serverUsed.length > 0) {
        usedAssets = {};
        serverUsed.forEach(u => {
          if (!usedAssets[u.ticker]) usedAssets[u.ticker] = [];
          if (!usedAssets[u.ticker].some(e => e.assetId === u.assetId)) {
            usedAssets[u.ticker].push({ assetId: u.assetId, time: new Date(u.createdAt || Date.now()).getTime() });
          }
        });
        localStorage.setItem('cr_used_assets', JSON.stringify(usedAssets));
      }
    } catch (e) {
      console.warn('syncFromServer failed:', e.message);
    }
  }

  function isScooterUsed() {
    loadUsedAssetsFromStorage();
    return Object.values(usedAssets).some(arr => arr.some(e => e.assetId === 'scooter'));
  }

  function isAssetUnlocked(id) {
    const b = ASSETS.find(b => b.id === id);
    if (!b) return false;
    if (b.unlock === 'free')   return true;
    // Ride-based assets (sports, solana, pump, monster) unlock based on claimed + unclaimed
    if (b.unlock === 'ride') {
      return getEffectiveBalance() >= b.rideRequired;
    }
    // Non-connected users can only use free assets
    if (!walletAddress) return false;
    if (b.unlock === 'earned') return unlockedAssets.has(id);
    return false;
  }

  function unlockAsset(id) {
    unlockedAssets.add(id);
    saveAssetUnlocks();
    if (walletAddress && API.getToken()) {
      API.unlockAsset(id).catch(e => console.warn('unlockAsset API error:', e.message));
    }
  }

  let walletAddress = null;
  let currentCoin   = null;

  // ── Per-ticker asset usage (12h cooldown per asset per ticker) ──
  // Structure: { "BTC": [{ assetId: "scooter", time: 1712345678000 }, ...] }
  let usedAssets = {};

  const COOLDOWN_MS = 12 * 60 * 60 * 1000;  // 12 hours

  function loadUsedAssetsFromStorage() {
    if (Object.keys(usedAssets).length === 0) {
      const stored = localStorage.getItem('cr_used_assets');
      if (stored) {
        try {
          const raw = JSON.parse(stored);
          usedAssets = {};
          for (const [ticker, entries] of Object.entries(raw)) {
            usedAssets[ticker] = (Array.isArray(entries) ? entries : []).map(e =>
              typeof e === 'string' ? { assetId: e, time: Date.now() } : e
            ).filter(e => Date.now() - e.time < COOLDOWN_MS);
          }
          localStorage.setItem('cr_used_assets', JSON.stringify(usedAssets));
        } catch (_) { usedAssets = {}; }
      }
    }
  }

  function isAssetOnCooldown(assetId, ticker) {
    loadUsedAssetsFromStorage();
    if (!usedAssets[ticker]) return false;
    const entry = usedAssets[ticker].find(e => e.assetId === assetId);
    if (!entry) return false;
    return Date.now() - entry.time < COOLDOWN_MS;
  }

  function isAssetEverUsedOnTicker(assetId, ticker) {
    loadUsedAssetsFromStorage();
    if (!usedAssets[ticker]) return false;
    return usedAssets[ticker].some(e => e.assetId === assetId);
  }

  function syncUnsyncedUsedAssets() {
    if (!walletAddress || !API.getToken()) return;
    loadUsedAssetsFromStorage();
    const localAssets = JSON.parse(JSON.stringify(usedAssets));
    API.getUsedAssets().then(serverAssets => {
      const serverSet = new Set((serverAssets || []).map(u => (u.assetId || u.asset_id) + ':' + (u.ticker || '')));
      for (const [ticker, entries] of Object.entries(localAssets)) {
        entries.forEach(e => {
          if (!serverSet.has(e.assetId + ':' + ticker)) {
            API.markAssetUsed(e.assetId, ticker).catch(() => {});
          }
        });
      }
    }).catch(() => {});
  }

  function markAssetUsed(assetId, ticker) {
    if (!ticker) return;
    loadUsedAssetsFromStorage();
    if (!usedAssets[ticker]) usedAssets[ticker] = [];
    const idx = usedAssets[ticker].findIndex(e => e.assetId === assetId);
    if (idx !== -1) {
      usedAssets[ticker][idx].time = Date.now();
    } else {
      usedAssets[ticker].push({ assetId, time: Date.now() });
    }
    localStorage.setItem('cr_used_assets', JSON.stringify(usedAssets));
    if (walletAddress && API.getToken()) {
      API.markAssetUsed(assetId, ticker).catch(e => console.warn('markAssetUsed API error:', e.message));
    }
  }

  function isAssetAvailable(assetId, ticker) {
    if (!ticker) return isAssetUnlocked(assetId);
    if (isAssetOnCooldown(assetId, ticker)) return false;
    // Rabbit only becomes available on a ticker AFTER scooter has been used+claimed there
    if (assetId === 'rabbit') {
      return isAssetUnlocked(assetId) && isAssetOnCooldown('scooter', ticker);
    }
    return isAssetUnlocked(assetId);
  }

  buildAssetSelector();

  // ─────────────────────────────────────────────────────────
  // CANVAS / RIDE MODE
  // ─────────────────────────────────────────────────────────

  function enterRideMode() {
    document.getElementById('introModal').classList.add('hidden');
    document.body.classList.add('ride-mode');
    rideHud.classList.remove('hidden');
    
    // Update and show active coin/timeframe HUD in top-left
    if (rideHudCoin) {
      const tf = (ChartModule.getActiveTimeframe() || '3M').toLowerCase();
      const coinName = (currentCoin || 'SOL').toLowerCase();
      rideHudCoin.textContent = `${coinName} usd - ${tf}`;
      rideHudCoin.classList.remove('hidden');
    }
    
    resizeCanvasForRide();
    rebuildTerrainVertices();
  }

  function exitRideMode() {
    document.body.classList.remove('ride-mode');
    rideHud.classList.add('hidden');

    canvas.width  = 900;
    canvas.height = 400;
    canvas.style.width  = '';
    canvas.style.height = '';
    rebuildTerrainVertices();

    if (rawPrices.length > 0) drawChartPreview();
    else drawScene();
  }

  function resizeCanvasForRide() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  window.addEventListener('resize', () => {
    if (isRiding) {
      resizeCanvasForRide();
      rebuildTerrainVertices();
    }
  });

  // ─────────────────────────────────────────────────────────
  // PHYSICS CONSTANTS — Arcade StonkRider Feel
  // ─────────────────────────────────────────────────────────

  // Physics constants
  const GRAVITY             = 0.20;    // px/frame² downward
  const ACCELERATION        = 0.35;    // Horizontal thrust on gas
  const MAX_SPEED           = 7;       // Top speed cap
  const GROUND_DRAG         = 0.96;    // 4% loss/frame on ground
  const AIR_FRICTION        = 0.998;   // Minimal air drag

  // Climbing Assist System
  const CLIMB_SLOPE_THRESHOLD  = -0.17; // Starts boosting at ~10 degrees uphill (radians)
  const CLIMB_FORCE_MULTIPLIER = 1.75;  // Scales acceleration up to 1.75x
  const MAX_CLIMB_BOOST        = 0.3;   // Max direct slope-aligned speed boost per frame
  const CLIMB_CHARGE_RATE      = 0.03;  // Charge buildup per frame (50% faster buildup)
  const CLIMB_DECAY_RATE       = 0.05;  // Charge decay per frame on flat ground

  // Lean / rotation
  const LEAN_SPEED_AIR      = 0.005;   // Air rotation for flips (reduced to balance momentum persistence)
  const LEAN_SPEED_GND      = 0.012;   // Ground lean / wheelies
  const DRIVE_WHEELIE_COEFF = 0.01;    // Wheelie torque per ACCELERATION
  const ANGULAR_DAMPING     = 0.92;    // Rotation damping

  // Anti-stall: burst of speed when stuck on steep slopes
  const STALL_BOOST         = 0.5;     // Extra push when speed < 2

  // Dimensions
  const WHEEL_RADIUS        = 10;      // Visual and collision radius
  const WHEEL_BASE          = 44;      // Distance between wheels
  const HALF_BASE           = WHEEL_BASE / 2;
  const CHASSIS_HEIGHT      = 15;      // How high chassis sits above wheels

  // Jump
  const JUMP_IMPULSE        = 11;      // Direct vy impulse (was 13)

  // Camera
  const CAM_LOOKAHEAD_SCALE = 5.0;
  const CAM_LERP_X          = 0.15;
  const CAM_LERP_Y          = 0.15;
  const CAM_IMPACT_SHAKE    = 0.15;

  // Screen placement of the bike
  const BIKE_SCREEN_X       = 0.22;
  const BIKE_SCREEN_Y       = 0.60;

  // Terrain / canvas
  const TERRAIN_POINT_SPACING = 78;
  const TRACK_BASE_HEIGHT     = 80;

  // Asset draw size
  const RIDE_ASSET_SIZE = 46;

  // Nitro System
  const NITRO_CAPACITY        = 100;
  const NITRO_CONSUMPTION     = 100 / 300;   // Depletes in 5 seconds at 60 FPS
  const NITRO_RECHARGE        = 100 / 900;   // Recharges in 15 seconds at 60 FPS
  const NITRO_BOOST_ACCEL     = 0.35;
  const NITRO_MAX_SPEED_MULT  = 1.7;

  // Minimap
  const MINIMAP_WIDTH   = 140;
  const MINIMAP_HEIGHT  = 63;
  const MINIMAP_PADDING = 8;
  const MINIMAP_MARGIN  = 14;

  // ─────────────────────────────────────────────────────────
  // PHYSICS STATE
  // ─────────────────────────────────────────────────────────

  const physics = {
    // Chassis centre-of-mass (world coords)
    x: 0, y: 0,
    vx: 0, vy: 0,

    // Chassis orientation
    angle: 0,
    angularVel: 0,

    // Visual spin
    rearWheelAngle:  0,
    frontWheelAngle: 0,

    // Contact flags
    rearGrounded:  false,
    frontGrounded: false,

    // Landing impact tracking
    lastVyOnLand: 0,

    // Camera smooth state
    smoothCamX: 0,
    smoothCamY: 0,
    camShake:   0,

    // Climbing state
    climbCharge: 0,
    
    // Nitro & Flips
    nitro: 100,
    lastAngle: 0,
    totalRotation: 0,
  };

  const keys = {
    gas:       false,
    tiltLeft:  false,
    tiltRight: false,
    jump:      false,
    nitro:     false,
  };

  // Game UI variables
  let flipTextTimer     = 0;

  // ─────────────────────────────────────────────────────────
  // GAME STATE
  // ─────────────────────────────────────────────────────────

  let rawPrices         = [];
  let rawTimestamps     = [];
  let terrainVertices   = [];
  let minimapVertices   = [];
  let minimapBounds     = null;
  let predictionTarget  = null;
  let userPrediction    = null;
  let checkpoints       = [];
  let lastCheckpointIdx = 0;

  let isRiding          = false;
  let isPaused          = false;
  let pauseStartTime    = null;
  let pausedDuration    = 0;
  let cameraX           = 0;
  let cameraY           = 0;
  let distance          = 0;
  let crashCount        = 0;
  let lastRideDuration  = 0;
  let animationFrameId  = null;

  // Asset module placeholder
  let currentAssetObj = AssetModule.createAsset();
  currentAssetObj.width  = RIDE_ASSET_SIZE;
  currentAssetObj.height = RIDE_ASSET_SIZE;

  // ─────────────────────────────────────────────────────────
  // PHYSICS HELPERS
  // ─────────────────────────────────────────────────────────

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getAxlePos(cx, cy, angle, sign) {
    const perpAngle = angle + Math.PI / 2;
    return {
      x: cx + Math.cos(angle) * HALF_BASE * sign + Math.cos(perpAngle) * CHASSIS_HEIGHT,
      y: cy + Math.sin(angle) * HALF_BASE * sign + Math.sin(perpAngle) * CHASSIS_HEIGHT,
    };
  }

  function getWheelPenetration(worldX, wheelY) {
    const tp          = getTerrainPointAtX(clamp(worldX, 0, getTotalTrackWidth()));
    const penetration = (wheelY + WHEEL_RADIUS) - tp.y;
    return { penetration, groundY: tp.y, rotation: tp.rotation };
  }

  // ─────────────────────────────────────────────────────────
  // RESET PHYSICS
  // ─────────────────────────────────────────────────────────

  function resetPhysics(startX) {
    const tp = getTerrainPointAtX(startX);

    physics.x  = startX;
    physics.y  = tp.y - CHASSIS_HEIGHT - WHEEL_RADIUS - 2;
    physics.vx = 0;
    physics.vy = 0;

    physics.angle          = tp.rotation;
    physics.angularVel     = 0;

    physics.rearWheelAngle  = 0;
    physics.frontWheelAngle = 0;

    physics.rearGrounded  = true;
    physics.frontGrounded = true;
    physics.crashed       = false;

    physics.lastVyOnLand  = 0;
    physics.camShake      = 0;
    physics._zoom         = 1;
    physics.climbCharge   = 0;
    physics.nitro         = NITRO_CAPACITY;
    physics.nitroDepleted = false;
    physics.lastAngle     = tp.rotation;
    physics.totalRotation = 0;
    physics.smoothCamX    = startX - canvas.width  * BIKE_SCREEN_X;
    physics.smoothCamY    = physics.y - canvas.height * BIKE_SCREEN_Y;
  }

  // ─────────────────────────────────────────────────────────
  // STEP PHYSICS  — Arcade StonkRider Model
  // ─────────────────────────────────────────────────────────

  function getPhysicsTerrainPointAtX(worldX) {
    const lookAhead = 15;
    const p1 = getTerrainPointAtX(worldX - lookAhead);
    const p2 = getTerrainPointAtX(worldX);
    const p3 = getTerrainPointAtX(worldX + lookAhead);

    // Average Y to smooth out sharp peaks/valleys for physics only
    const y = (p1.y + p2.y + p3.y) / 3;

    // Average rotation smoothly using vectors
    const vx = Math.cos(p1.rotation) + Math.cos(p2.rotation) + Math.cos(p3.rotation);
    const vy = Math.sin(p1.rotation) + Math.sin(p2.rotation) + Math.sin(p3.rotation);
    const rotation = Math.atan2(vy, vx);

    return { y, rotation, segment: p2.segment };
  }

  function stepPhysics() {
    const totalWidth = getTotalTrackWidth();
    const currentTp = getPhysicsTerrainPointAtX(physics.x);

    // ── 1. User Input & Rotation ────────────────────────────
    const leanSpeed = (physics.rearGrounded || physics.frontGrounded) ? LEAN_SPEED_GND : LEAN_SPEED_AIR;
    if (keys.tiltLeft)  physics.angularVel -= leanSpeed;
    if (keys.tiltRight) physics.angularVel += leanSpeed;

    // Wheelie torque from acceleration
    if (keys.gas && (physics.rearGrounded || physics.frontGrounded)) {
      physics.angularVel -= ACCELERATION * DRIVE_WHEELIE_COEFF;
    }

    // Dynamic Angular Damping
    let currentDamping = ANGULAR_DAMPING; // 0.92
    // Less damping when wheelieing, nose manualing, or airborne to allow free rotation
    if (!(physics.rearGrounded && physics.frontGrounded)) {
       currentDamping = 0.99;
    }
    
    physics.angularVel *= currentDamping;
    physics.angle += physics.angularVel;
    
    // Track flips for Nitro
    let deltaAngle = physics.angle - (physics.lastAngle || 0);
    while (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
    while (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
    physics.totalRotation += deltaAngle;
    physics.lastAngle = physics.angle;

    // Only reward flips when airborne to prevent ground spinning exploits
    if (!physics.rearGrounded && !physics.frontGrounded) {
       if (Math.abs(physics.totalRotation) >= Math.PI * 1.8) { // 324 degrees to count as a flip
         physics.nitro = Math.min(NITRO_CAPACITY, physics.nitro + 5);
         physics.totalRotation -= Math.sign(physics.totalRotation) * Math.PI * 2;
         flipTextTimer = 60;
         Sound.flip();
       }
    } else {
       // Reset rotation counter when grounded
       physics.totalRotation = 0;
    }

    // ── 2. Drag ─────────────────────────────────────────────
    if (physics.rearGrounded || physics.frontGrounded) {
      physics.vx *= GROUND_DRAG;
      
      // Constant kinetic friction to stop micro-oscillations when idle
      if (!keys.gas && !keys.nitro) {
         const KINETIC_FRICTION = 0.08;
         if (physics.vx > KINETIC_FRICTION) {
             physics.vx -= KINETIC_FRICTION;
         } else if (physics.vx < -KINETIC_FRICTION) {
             physics.vx += KINETIC_FRICTION;
         } else {
             physics.vx = 0;
         }
      }
    } else {
      physics.vx *= AIR_FRICTION;
    }

    // ── 3. Drive ────────────────────────────────────────────
    if (!keys.nitro) {
      physics.nitroDepleted = true;
    }

    if (physics.nitro >= NITRO_CAPACITY) {
      physics.nitroDepleted = false;
    }

    let usingNitro = keys.nitro && physics.nitro > 0 && !physics.nitroDepleted;
    let currentMaxSpeed = MAX_SPEED;

    if (usingNitro) {
      physics.nitro = Math.max(0, physics.nitro - NITRO_CONSUMPTION);
      if (physics.nitro <= 0) {
        physics.nitroDepleted = true;
      }
      currentMaxSpeed *= NITRO_MAX_SPEED_MULT;
      
      // Rocket thrust along chassis orientation
      physics.vx += Math.cos(physics.angle) * NITRO_BOOST_ACCEL;
      physics.vy += Math.sin(physics.angle) * NITRO_BOOST_ACCEL;
    } else {
      physics.nitro = Math.min(NITRO_CAPACITY, physics.nitro + NITRO_RECHARGE);
    }

    if (keys.gas && (physics.rearGrounded || physics.frontGrounded)) {
      let driveX = ACCELERATION;
      let driveY = 0;
      
      // Climbing Assist System with Charge Build-up
      if (currentTp.rotation < CLIMB_SLOPE_THRESHOLD) {
         // Build charge while climbing
         physics.climbCharge = Math.min(1.0, physics.climbCharge + CLIMB_CHARGE_RATE);
         
         const MAX_CLIMB_ANGLE = -1.04; // ~60 degrees
         let slopeFactor = (currentTp.rotation - CLIMB_SLOPE_THRESHOLD) / (MAX_CLIMB_ANGLE - CLIMB_SLOPE_THRESHOLD);
         slopeFactor = clamp(slopeFactor, 0, 1);
         slopeFactor = slopeFactor * slopeFactor; // Quadratic easing
         
         const effectiveCharge = slopeFactor * physics.climbCharge;
         
         let climbAccel = ACCELERATION * (1 + (CLIMB_FORCE_MULTIPLIER - 1) * effectiveCharge);
         climbAccel += MAX_CLIMB_BOOST * effectiveCharge;
         
         // Apply drive force along the slope tangent
         driveX = climbAccel * Math.cos(currentTp.rotation);
         driveY = climbAccel * Math.sin(currentTp.rotation);
      } else {
         // Decay charge smoothly when transitioning over flat ground
         physics.climbCharge = Math.max(0, physics.climbCharge - CLIMB_DECAY_RATE);
      }

      physics.vx += driveX;
      physics.vy += driveY;
      
      // Anti-stall burst when stuck
      if (Math.abs(physics.vx) < 2) {
        physics.vx += STALL_BOOST;
      }
    } else {
      // Instant reset if gas released
      physics.climbCharge = 0;
    }

    // Speed caps (applies mostly to forward drive, gravity can still pull down fast)
    if (physics.vx > currentMaxSpeed) physics.vx = currentMaxSpeed;
    if (physics.vx < -5) physics.vx = -5;

    // ── 4. Jump ─────────────────────────────────────────────
    if (keys.jump && (physics.rearGrounded || physics.frontGrounded)) {
      keys.jump = false;
      physics.vy = -JUMP_IMPULSE;
      physics.rearGrounded = false;
      physics.frontGrounded = false;
      Sound.jump();
    }

    // ── 5. Gravity ──────────────────────────────────────────
    physics.vy += GRAVITY;
    const wasGrounded = physics.rearGrounded || physics.frontGrounded;
    if (!wasGrounded) physics.vy *= AIR_FRICTION;

    // Hard absolute speed cap (magnitude)
    const HARD_SPEED_LIMIT = 14.0;
    const speedMag = Math.sqrt(physics.vx * physics.vx + physics.vy * physics.vy);
    if (speedMag > HARD_SPEED_LIMIT) {
      physics.vx = (physics.vx / speedMag) * HARD_SPEED_LIMIT;
      physics.vy = (physics.vy / speedMag) * HARD_SPEED_LIMIT;
    }

    // ── 6. Move ─────────────────────────────────────────────
    physics.x += physics.vx;
    physics.y += physics.vy;
    physics.x = clamp(physics.x, 0, totalWidth);

    // ── 7. Physics Terrain Following ────────────────────────
    
    // Find wheel positions relative to a zero-Y chassis to calculate true lift
    const rAxleRaw = getAxlePos(physics.x, 0, physics.angle, -1);
    const fAxleRaw = getAxlePos(physics.x, 0, physics.angle, 1);
    
    // Get smoothed terrain at exactly the wheel positions
    const rTp = getPhysicsTerrainPointAtX(clamp(rAxleRaw.x, 0, totalWidth));
    const fTp = getPhysicsTerrainPointAtX(clamp(fAxleRaw.x, 0, totalWidth));
    
    // Calculate required chassis Y to keep each wheel exactly on the ground
    const requiredYForRear = rTp.y - WHEEL_RADIUS - rAxleRaw.y;
    const requiredYForFront = fTp.y - WHEEL_RADIUS - fAxleRaw.y;
    
    // The true ground surface for the chassis is determined by whichever wheel needs the chassis to be highest
    const surfaceY = Math.min(requiredYForRear, requiredYForFront);
    
    // Smooth the ground tolerance
    const rawTolerance = 3 + Math.max(0, currentTp.rotation || 0) * 15;
    const prevTol = physics._groundTol !== undefined ? physics._groundTol : rawTolerance;
    const GROUND_TOLERANCE = rawTolerance > prevTol
      ? rawTolerance
      : prevTol * 0.85 + rawTolerance * 0.15;
    physics._groundTol = GROUND_TOLERANCE;

    // Crash check using visual terrain (highly responsive)
    const upAngle = physics.angle - Math.PI / 2;
    const headX = physics.x + Math.cos(upAngle) * 20; // 1.0x Scale
    const headY = physics.y + Math.sin(upAngle) * 20;
    const headTp = getTerrainPointAtX(clamp(headX, 0, totalWidth));
    
    if (headY >= headTp.y) {
      physics.crashed = true;
    }

    // Ground / air determination
    const nowGrounded = physics.y >= surfaceY - GROUND_TOLERANCE;

    if (nowGrounded) {
      // Determine exactly which wheels are touching the ground
      const rDist = requiredYForRear - surfaceY;
      const fDist = requiredYForFront - surfaceY;
      
      physics.rearGrounded  = rDist < 5;
      physics.frontGrounded = fDist < 5;
      
      // Fallback in case of rounding errors
      if (!physics.rearGrounded && !physics.frontGrounded) {
          physics.rearGrounded = true;
          physics.frontGrounded = true;
      }

      // ── ON TERRAIN ──
      if (!wasGrounded && physics.vy > 6) {
        physics.camShake = Math.min(physics.vy * CAM_IMPACT_SHAKE, 8);
      }

      // Momentum preservation: Redirect velocity along the slope.
      const nx = Math.sin(currentTp.rotation);
      const ny = -Math.cos(currentTp.rotation);
      
      // Calculate how much velocity is pushing directly into the ground
      const vDotN = physics.vx * nx + physics.vy * ny;
      
      // If velocity is pushing INTO the terrain (vDotN < 0), kill that component
      if (vDotN < 0) {
        const oldSpeed = Math.hypot(physics.vx, physics.vy);
        
        physics.vx -= vDotN * nx;
        physics.vy -= vDotN * ny;
        
        // Arcade Momentum Preservation: 
        // When transitioning from flat to steep, mathematically we lose speed.
        // We restore 60% of that lost impact energy to simulate a bouncy, momentum-carrying suspension.
        const newSpeed = Math.hypot(physics.vx, physics.vy);
        if (newSpeed > 0.1 && oldSpeed > newSpeed) {
           const restoredSpeed = newSpeed + (oldSpeed - newSpeed) * 0.60;
           const ratio = restoredSpeed / newSpeed;
           physics.vx *= ratio;
           physics.vy *= ratio;
        }
      }
      
      // Soft position correction to prevent sinking. 
      // Only snap if we are actually below the smoothed surface.
      // We don't snap downwards if we are hovering within the GROUND_TOLERANCE.
      if (physics.y > surfaceY) {
        physics.y = surfaceY;
      }

      physics.rearGrounded  = true;
      physics.frontGrounded = true;
    } else {
      // ── AIRBORNE ──
      physics.rearGrounded  = false;
      physics.frontGrounded = false;
      physics.lastVyOnLand  = physics.vy;
      physics.climbCharge   = 0; // Instant reset on airborne
    }

    // ── 8. Gentle Terrain Alignment & Pivot Torques ────────
    if (nowGrounded && !keys.tiltLeft && !keys.tiltRight) {
      if (physics.rearGrounded && physics.frontGrounded) {
        // Both wheels grounded: Align to visual terrain to remain stable
        const rWheelX = physics.x - Math.cos(physics.angle) * HALF_BASE;
        const fWheelX = physics.x + Math.cos(physics.angle) * HALF_BASE;
        const rY = getTerrainPointAtX(clamp(rWheelX, 0, totalWidth)).y;
        const fY = getTerrainPointAtX(clamp(fWheelX, 0, totalWidth)).y;
        const targetAngle = Math.atan2(fY - rY, WHEEL_BASE);

        let diff = targetAngle - physics.angle;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;

        physics.angle += diff * 0.12; 
      } else if (physics.rearGrounded) {
        // Wheelie: Gravity slowly pulls the front wheel down
        physics.angularVel += 0.006;
      } else if (physics.frontGrounded) {
        // Nose manual: Gravity slowly pulls the rear wheel down
        physics.angularVel -= 0.006;
      }
    }

    // ── 9. Visuals ──────────────────────────────────────────
    physics.rearWheelAngle  += physics.vx * 0.12;
    physics.frontWheelAngle += physics.vx * 0.12;
    physics.camShake *= 0.82;
  }

  // ─────────────────────────────────────────────────────────
  // WALLET
  // ─────────────────────────────────────────────────────────

  const walletModal         = document.getElementById('walletModal');
  const walletListEl        = document.getElementById('walletList');
  const walletCloseBtn      = document.getElementById('walletCloseBtn');
  const walletDashboard     = document.getElementById('walletDashboard');

  const WALLET_ICONS = {
    backpack: '<img src="assets/BackpackIcon.svg" alt="Backpack" width="28" height="28">',
    phantom: '<img src="assets/PhantomIcon.png" alt="Phantom" width="28" height="28">',
    solflare: '<img src="assets/SolflareIcon.png" alt="Solflare" width="28" height="28">',
    trust: '<img src="assets/TrustWalletIcon.png" alt="TrustWallet" width="28" height="28">',
    walletconnect: '<img src="assets/walletconnectIcon.png" alt="WalletConnect" width="28" height="28">',
  };

  const WALLET_DEFS = [
    { id: 'backpack',    name: 'Backpack',       icon: WALLET_ICONS.backpack, detect: () => !!(window.backpack?.isBackpack || window.xnft?.solana) },
    { id: 'phantom',     name: 'Phantom',        icon: WALLET_ICONS.phantom, detect: () => !!(window.phantom?.solana?.isPhantom) },
    { id: 'solflare',    name: 'Solflare',       icon: WALLET_ICONS.solflare, detect: () => !!(window.solflare?.isSolflare || window.solana?.isSolflare) },
    { id: 'trust',       name: 'TrustWallet',    icon: WALLET_ICONS.trust, detect: () => !!(window.ethereum?.isTrust || window.ethereum?.providers?.some(p => p.isTrust)) },
    { id: 'walletconnect',name: 'WalletConnect', icon: WALLET_ICONS.walletconnect, detect: () => {
        if (!window.ethereum) return false;
        const isMetaMask = !!window.ethereum.isMetaMask;
        const isTrust = !!window.ethereum.isTrust;
        const isPhantom = !!window.ethereum.isPhantom || (window.phantom?.ethereum && window.ethereum === window.phantom.ethereum);
        return window.ethereum && !isMetaMask && !isTrust && !isPhantom;
      }
    },
  ];

  function detectWallets() {
    return WALLET_DEFS.map(w => ({
      ...w,
      detected: !!w.detect(),
    }));
  }

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' timed out')), ms)),
    ]);
  }

  function getEVMProvider(walletId) {
    if (!window.ethereum) return null;
    const isMimic = (p) => {
      return !!p.isPhantom || !!p.isTrust || !!p.isCoinbaseWallet || !!p.isBraveWallet || !!p.isRabby || !!p.isSolflare || (window.phantom?.ethereum && p === window.phantom.ethereum);
    };
    if (window.ethereum.providers && Array.isArray(window.ethereum.providers)) {
      if (walletId === 'metamask') {
        const mm = window.ethereum.providers.find(p => p.isMetaMask && !isMimic(p));
        if (mm) return mm;
      }
      if (walletId === 'trust') {
        const tw = window.ethereum.providers.find(p => p.isTrust);
        if (tw) return tw;
      }
    }
    return window.ethereum;
  }

  // Detects all known wallet rejection/cancellation patterns across EVM and Solana wallets
  function isUserRejection(err) {
    if (!err) return false;
    // EVM: code 4001 is the standard user rejection
    if (err.code === 4001 || err.code === 'ACTION_REJECTED') return true;
    // Backpack: -32002 means a request popup is already open (user closed it or there's a pending one)
    if (err.code === -32002) return true;
    // Solana wallets often use code -32603 with a rejection message, or custom codes
    if (err.code === -32603 && /reject|cancel|denied|user/i.test(err.message || '')) return true;
    // Catch-all message pattern check — covers Backpack 'User Rejected Request', 'request declined', etc.
    return /rejected|cancelled|canceled|denied|declined|user (closed|rejected|declined|dismissed|cancelled)|approval rejected|request rejected/i.test(err.message || '');
  }

  async function connectWallet(wid) {
    if (wid === 'backpack') {
      // Backpack Solana provider
      const bpProvider = window.backpack?.isBackpack ? window.backpack : (window.xnft?.solana || null);
      if (bpProvider) {
        try {
          const resp = await withTimeout(bpProvider.connect(), 20000, 'Backpack connect');
          const pk = resp?.publicKey || bpProvider.publicKey;
          if (!pk) throw new Error('No public key received');
          return pk.toString();
        } catch (err) {
          // -32002: Backpack popup already open or user closed a previous one
          if (err.code === -32002) {
            const rejection = new Error('Connection request already pending — please open Backpack and approve or reject it');
            rejection.code = 4001; // normalise to standard user rejection
            throw rejection;
          }
          throw err; // re-throw so isUserRejection() handles it upstream
        }
      }
      throw new Error('Backpack not detected');
    }

    if (wid === 'phantom') {
      // Backpack intercepts Phantom's connect() at the extension level
      if (window.backpack?.isBackpack) {
        throw new Error('Backpack extension is interfering with Phantom. Please disable Backpack temporarily, or use Backpack directly.');
      }
      const phProvider = window.phantom?.solana;
      if (phProvider && phProvider.isPhantom) {
        const resp = await withTimeout(phProvider.connect(), 20000, 'Phantom connect');
        if (!resp.publicKey) throw new Error('No public key received');
        return resp.publicKey.toString();
      }
      throw new Error('Phantom not detected');
    }

    if (wid === 'solflare') {
      const sfProvider = window.solflare || (window.solana?.isSolflare ? window.solana : null);
      if (sfProvider) {
        if (sfProvider.isConnected && sfProvider.publicKey) {
          return sfProvider.publicKey.toString();
        }
        const resp = await withTimeout(sfProvider.connect(), 20000, 'Solflare connect');
        const pk = resp?.publicKey || sfProvider.publicKey;
        if (!pk) throw new Error('No public key received');
        return pk.toString();
      }
      throw new Error('Solflare not detected');
    }

    // Trust / WalletConnect — EVM
    const provider = getEVMProvider(wid);
    if (!provider) throw new Error('No Ethereum provider detected');
    if (wid === 'trust' && !provider.isTrust) {
      throw new Error('TrustWallet is not the active provider');
    }

    // Request connection with timeout
    const accounts = await withTimeout(provider.request({ method: 'eth_requestAccounts' }), 20000, 'Wallet connect');

    if (!accounts || !accounts[0]) {
      const err = new Error('Connection rejected');
      err.code = 4001;
      throw err;
    }
    return accounts[0];
  }

  function buildWalletList() {
    const wallets = detectWallets();
    walletListEl.innerHTML = wallets.map(w => `
      <div class="wallet-item">
        <div class="wallet-icon">${w.icon}</div>
        <div class="wallet-info">
          <div class="wallet-name">${w.name}</div>
          <div class="wallet-status ${w.detected ? 'wallet-status-detected' : 'wallet-status-missing'}">
            ${w.detected ? 'Detected' : 'Not detected'}
          </div>
        </div>
        <button class="wallet-connect-btn ${w.detected ? 'wallet-connect-btn-ready' : 'wallet-connect-btn-disabled'}"
                data-wallet="${w.id}"
                ${w.detected ? '' : 'disabled'}>
          ${w.detected ? 'Connect' : 'Install'}
        </button>
      </div>
    `).join('');

    // Click handlers
    walletListEl.querySelectorAll('.wallet-connect-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.classList.add('wallet-connecting');
        btn.innerHTML = '<span class="spinner"></span> Connecting...';

        // Helper: flash a rejection/error state on the button, then reset
        const showBtnState = (html, cssClass, duration = 2000) => {
          btn.classList.remove('wallet-connecting');
          btn.classList.add(cssClass);
          btn.innerHTML = html;
          setTimeout(() => {
            btn.disabled = false;
            btn.classList.remove(cssClass);
            btn.innerHTML = originalHTML;
          }, duration);
        };

        try {
          const walletId = btn.dataset.wallet;
          const address = await connectWallet(walletId);
          localStorage.setItem('cr_wallet_type', walletId);
          // onWalletConnected handles signing — pass the button so signing rejection can update it
          await onWalletConnected(address, true, btn, originalHTML);
        } catch (err) {
          if (isUserRejection(err)) {
            showBtnState('✕ Rejected', 'wallet-btn-rejected', 2500);
            showToast('Canceled connecting Wallet', true);
          } else {
            showBtnState('✕ Failed', 'wallet-btn-rejected', 2500);
            showToast(err.message || 'Connection failed', true);
          }
        }
      });
    });
  }

  function showWalletModal(subtitle) {
    buildWalletList();
    document.getElementById('walletHint').textContent =
      subtitle || 'Connect your wallet to track rewards and leaderboard scores.';
    walletModal.classList.remove('hidden');
  }

  function hideWalletModal() {
    walletModal.classList.add('hidden');
  }

  async function onWalletConnected(address, showNotification, connectBtn, connectBtnOriginalHTML) {
    walletAddress = address;
    localStorage.setItem('cr_wallet', address);
    // Wallet modal stays visible until auth completes
    // Pass button reference so signing rejection can update it
    await authenticateWallet(address, showNotification, connectBtn, connectBtnOriginalHTML);
  }

  async function authenticateWallet(address, showNotification, connectBtn, connectBtnOriginalHTML) {
    // Helper to reset button to rejected state if the modal is still open
    const onSigningRejected = (msg) => {
      walletAddress = null;
      localStorage.removeItem('cr_wallet');
      localStorage.removeItem('cr_wallet_type');
      if (connectBtn) {
        connectBtn.classList.remove('wallet-connecting');
        connectBtn.classList.add('wallet-btn-rejected');
        connectBtn.innerHTML = '✕ Signature Rejected';
        setTimeout(() => {
          connectBtn.disabled = false;
          connectBtn.classList.remove('wallet-btn-rejected');
          connectBtn.innerHTML = connectBtnOriginalHTML;
        }, 2500);
      }
      showToast(msg, true);
    };

    try {
      if (connectBtn) {
        connectBtn.classList.add('wallet-connecting');
        connectBtn.innerHTML = '<span class="spinner"></span> Connecting...';
      }

      const { message } = await API.getChallenge(address);
      let signature, sigType;
      if (address.startsWith('0x')) {
        // EVM wallet (Trust, WalletConnect, etc.)
        const walletType = localStorage.getItem('cr_wallet_type') || 'trust';
        const provider = getEVMProvider(walletType);
        if (!provider) throw new Error('No Ethereum provider found');
        const hexMsg = '0x' + Array.from(new TextEncoder().encode(message)).map(b => b.toString(16).padStart(2, '0')).join('');
        signature = await provider.request({
          method: 'personal_sign',
          params: [hexMsg, address],
        });
        sigType = 'evm';
      } else {
        // Solana wallet (Backpack / Phantom / Solflare)
        const walletType = localStorage.getItem('cr_wallet_type') || 'phantom';
        let solProvider = null;
        if (walletType === 'backpack') {
          solProvider = window.backpack?.isBackpack ? window.backpack : (window.xnft?.solana || null);
        } else if (walletType === 'solflare') {
          solProvider = window.solflare || (window.solana?.isSolflare ? window.solana : null);
        } else {
          solProvider = window.solana?.isPhantom ? window.solana : (window.phantom?.solana || null);
        }
        // Fallback: try any available Solana provider
        if (!solProvider) solProvider = window.backpack || window.solana || window.solflare;
        if (!solProvider) throw new Error('No Solana provider found');
        const encoded = new TextEncoder().encode(message);
        const signed = await solProvider.signMessage(encoded, 'utf8');
        const sigBytes = signed.signature instanceof Uint8Array ? signed.signature : signed;
        signature = Array.from(sigBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        sigType = 'solana';
      }

      if (!signature) return;

      if (connectBtn) {
        connectBtn.innerHTML = '<span class="spinner"></span> Connecting...';
      }

      const captchaToken = await getTurnstileToken();
      const data = await API.login(address, signature, sigType, captchaToken);
      if (data.token) {
        hideWalletModal();
        // Use balance from login response immediately — syncFromServer will update in background
        rideBalance = data.user.rideBalance;
        saveRideBalance();
        connectWalletBtn.classList.add('btn-secondary');
        connectWalletBtn.classList.add('hidden');
        walletDashboard.classList.remove('hidden');
        if (showNotification) {
          showToast('Wallet connected: ' + shortenAddress(address));
        }

        // Show dashboard immediately — run background syncs in parallel
        (async () => {
          // Clear legacy localStorage
          ['cr_ride', 'cr_daily_preds', 'cr_ticker_cooldowns'].forEach(k => localStorage.removeItem(k));
          await Promise.all([
            syncFromServer(),
            syncPredStateFromServer(),
          ]);
          syncUnsyncedPredictions();
          syncUnsyncedUsedAssets();
          if (currentCoin) buildAssetSelector();
          // If there is a pending ride completion, show victory overlay now
          if (pendingVictory) {
            pendingVictory = false;
            document.getElementById('victoryTime').textContent = pendingVictoryTime;
            document.getElementById('victoryDistance').textContent = pendingVictoryDistance;
            document.getElementById('victoryRide').textContent = pendingVictoryRide;
            document.getElementById('victoryCrashes').textContent = pendingVictoryCrashes;
            document.getElementById('victoryClaimBtn').textContent = 'Claim Rewards';
            document.getElementById('victorySubtitle').textContent = 'Claim rewards to lock them in, or retry for a better reward.';
            victoryOverlay.classList.remove('hidden');
          }
        })();
      } else {
        onSigningRejected('Authentication failed. Please try again.');
      }
    } catch (err) {
      console.warn('Auth failed:', err.message);
      if (isUserRejection(err)) {
        // User rejected the signature request — keep modal open so they can retry
        onSigningRejected('Canceled connecting Wallet');
      } else {
        // Genuine error (network, server, etc.)
        onSigningRejected('Connection failed: ' + (err.message || 'Unknown error'));
        disconnectWallet();
      }
    }
  }

  function shortenAddress(addr) {
    if (!addr) return 'Connect Wallet';
    if (addr.length <= 10) return addr;
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  }

  async function connectEVM() {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts[0]) {
        onWalletConnected(accounts[0], true);
      } else {
        showToast('Connection cancelled', true);
      }
    } catch (err) {
      if (err.code === 4001) {
        showToast('Connection cancelled', true);
      } else {
        showToast('Connection failed: ' + err.message, true);
      }
    }
  }

  async function connectPhantom() {
    try {
      const resp = await window.solana.connect();
      if (resp.publicKey) {
        onWalletConnected(resp.publicKey.toString(), true);
      } else {
        showToast('Connection cancelled', true);
      }
    } catch (err) {
      showToast('Connection cancelled', true);
    }
  }

  function disconnectWallet() {
    walletAddress = null;
    // Clear all session and cooldown data
    [
      'cr_wallet', 'cr_wallet_type',
      'cr_daily_preds', 'cr_ticker_cooldowns',
      'cr_preds', 'cr_preds_state',
      'cr_used_assets', 'cr_ride', 'cr_unclaimed', 'cr_unlocked',
    ].forEach(k => localStorage.removeItem(k));
    API.clearToken();
    connectWalletBtn.classList.remove('hidden');
    walletDashboard.classList.add('hidden');
  }

  walletCloseBtn.addEventListener('click', hideWalletModal);
  walletModal.addEventListener('click', e => {
    if (e.target === walletModal) hideWalletModal();
  });

  connectWalletBtn.addEventListener('click', showWalletModal);

  // ─────────────────────────────────────────────────────────
  // PREDICTION HISTORY & REWARDS
  // ─────────────────────────────────────────────────────────

  function syncUnsyncedPredictions() {
    const recs = JSON.parse(localStorage.getItem('cr_preds') || '[]');
    const unsynced = recs.filter(r => !r.synced);
    if (!unsynced.length) return;
    unsynced.forEach(async (pred) => {
      try {
        const json = await API.createPrediction({
          coin: pred.coin, direction: pred.direction,
          entryPrice: pred.entryPrice,
          reward: pred.reward || 10000,
        });
        const all = JSON.parse(localStorage.getItem('cr_preds') || '[]');
        const idx = all.findIndex(r => r.coin === pred.coin && !r.synced);
        if (idx !== -1) {
          all[idx].id = json.id;
          all[idx].synced = true;
          localStorage.setItem('cr_preds', JSON.stringify(all));
        }
      } catch (_) {}
    });
  }

  async function savePrediction(entryPrice) {
    const pred = {
      coin: currentCoin,
      direction: predictionTarget.direction,
      targetPct: predictionTarget.pct,
      entryPrice,
      exitPrice: 0,
      hit: null,
      reward: 10000,
    };
    // Clean old predictions (older than 12h) so user can re-predict
    const cutoff = Date.now() - 12 * 60 * 60 * 1000;
    let recs = JSON.parse(localStorage.getItem('cr_preds') || '[]');
    const oldLen = recs.length;
    recs = recs.filter(r => r.createdAt > cutoff || !r.synced);
    const existing = recs.find(r => r.coin === currentCoin);
    if (existing && existing.synced) return;
    if (recs.length !== oldLen || !existing) {
      if (!existing) {
        recs.unshift({ ...pred, id: Date.now(), claimed: false, createdAt: Date.now(), synced: false });
      }
      localStorage.setItem('cr_preds', JSON.stringify(recs));
    }

    if (walletAddress && API.getToken()) {
      try {
        const json = await API.createPrediction(pred);
        const all = JSON.parse(localStorage.getItem('cr_preds') || '[]');
        const idx = all.findIndex(r => r.coin === currentCoin && !r.synced);
        if (idx !== -1) {
          all[idx].id = json.id;
          all[idx].synced = true;
          localStorage.setItem('cr_preds', JSON.stringify(all));
        }
      } catch (err) {
        console.warn('savePrediction server failed, keeping local:', err.message);
      }
    }
  }

  function addRideBalance(amount) {
    rideBalance += amount;
    saveRideBalance();
  }

  // ─────────────────────────────────────────────────────────
  // PREDICTION LIMITS & TICKER COOLDOWNS
  // ─────────────────────────────────────────────────────────

  function calcTimeBonus(elapsedSeconds) {
    // ≤25s → full reward, then linear decay: -2% per second
    if (elapsedSeconds <= 25) return 1;
    return Math.max(0.1, 1 - (elapsedSeconds - 25) * 0.02);
  }

  // ── Prediction 12h state ──
  // For connected users, server is source of truth.
  // In-memory cache (synced from server or localStorage).
  let predStateCache = { predictions: [] };

  function loadPredState() {
    const now = Date.now();
    const cutoff = now - 12 * 60 * 60 * 1000;
    predStateCache.predictions = (predStateCache.predictions || []).filter(p => p.time >= cutoff);
    if (predStateCache.predictions.length > 0) return predStateCache;

    // Fallback to localStorage — only count predictions in the last 12h
    const raw = localStorage.getItem('cr_preds_state');
    if (!raw) return { predictions: [] };
    const all = JSON.parse(raw);
    all.predictions = (all.predictions || []).filter(p => p.time >= cutoff);
    predStateCache = all;
    return all;
  }

  function savePredState(state) {
    predStateCache = state;
    localStorage.setItem('cr_preds_state', JSON.stringify(state));
  }

  async function syncPredStateFromServer() {
    if (!walletAddress || !API.getToken()) return;
    try {
      const data = await API.getPredState();
      const tickers = data.tickers || [];
      if (tickers.length > 0) {
        predStateCache = {
          predictions: tickers.map(t => ({ ticker: t.toLowerCase(), time: Date.now() })),
        };
        localStorage.setItem('cr_preds_state', JSON.stringify(predStateCache));
      }
    } catch (_) {}
  }

  function canPredictTicker(ticker) {
    const state = loadPredState();
    const preds = state.predictions;
    if (!walletAddress) return { allowed: true };
    if (preds.some(p => p.ticker.toLowerCase() === ticker.toLowerCase())) return { allowed: false, reason: 'Already predicted ' + ticker + ' recently. Try again later.' };
    if (preds.length >= 10) return { allowed: false, reason: 'Prediction limit reached (10 per 12h).' };
    return { allowed: true };
  }

  function recordPrediction(ticker) {
    if (!walletAddress) return;
    const state = loadPredState();
    if (state.predictions.some(p => p.ticker.toLowerCase() === ticker.toLowerCase())) return;
    state.predictions.push({ ticker: ticker.toLowerCase(), time: Date.now() });
    savePredState(state);
  }

  // Pred state synced on connect via syncFromServer()

  // ─────────────────────────────────────────────────────────
  // CHART / TRACK LOADING
  // ─────────────────────────────────────────────────────────

  async function loadChart() {
    const coin = tickerInput.value.trim();
    if (!coin) return;

    // Clear prediction target if loading a different coin
    if (currentCoin && currentCoin !== coin.toUpperCase()) {
      predictionTarget = null;
    }

    // If at prediction limit, only allow coins already predicted
    if (walletAddress) {
      const state = loadPredState();
      if (state.predictions.length >= 10 && !state.predictions.some(p => p.ticker.toLowerCase() === coin.toLowerCase())) {
        showToast('Prediction limit reached. Only coins you have already predicted can be loaded.', true);
        return;
      }
    }

    isRiding = false; checkOrientation();
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    exitRideMode();

    rideStatusEl.textContent = 'Loading chart...';
    loadChartBtn.disabled    = true;
    document.getElementById('loadChartSpinner').classList.remove('hidden');
    document.getElementById('loadChartLabel').textContent = 'Loading...';

    const isSameCoin = currentCoin && currentCoin === coin.toUpperCase();
    if (!isSameCoin) {
      predictionBox.classList.add('hidden');
      readyPrompt.classList.add('hidden');
      predResultHud.style.display = 'none';
    }

    try {
      const prices = await ChartModule.fetchPriceData(coin);
      rawPrices    = prices;
      const series = ChartModule.getCurrentSeries();
      rawTimestamps = series.map(s => s.time);
      rebuildTerrainVertices();
      currentCoin              = coin.toUpperCase();
      currentCoinEl.textContent = currentCoin;
      chartNameText.textContent = currentCoin;
      chartTimeframeText.textContent = ChartModule.getActiveTimeframe() || '3M';
      resetRide();
      drawChartPreview();

      rideStatusEl.textContent  = 'Chart loaded!';
      // Sync balance with on-chain before showing asset selector
      if (walletAddress && API.getToken()) {
        try {
          const syncResult = await API.syncBalance();
          if (syncResult && typeof syncResult.rideBalance === 'number') {
            rideBalance = syncResult.rideBalance;
            saveRideBalance();
          }
          if (syncResult && typeof syncResult.unclaimedTotal === 'number') {
            unclaimedRewards = syncResult.unclaimedTotal;
            saveUnclaimedRewards();
          }
        } catch (_) {}
      }
      showPrediction();
    } catch (err) {
      console.error(err);
      rideStatusEl.textContent = 'Failed to load chart.';
      showToast(err.message || 'Failed to load chart.', true);
    } finally {
      loadChartBtn.disabled = false;
      document.getElementById('loadChartSpinner').classList.add('hidden');
      document.getElementById('loadChartLabel').textContent = 'Load Chart';
    }
  }

  // ─────────────────────────────────────────────────────────
  // PREDICTION
  // ─────────────────────────────────────────────────────────

  function showPrediction() {
    const can = canPredictTicker(currentCoin);
    if (!can.allowed) {
      rideStatusEl.textContent = can.reason + ' — ready to ride!';
      showReadyPrompt();
      return;
    }

    // Only generate a new prediction target if one doesn't exist
    if (!predictionTarget) {
      const direction = Math.random() < 0.5 ? 'up' : 'down';
      const pct = +(Math.random() * 4 + 1).toFixed(1); // 1.0% - 5.0%
      predictionTarget = { direction, pct };
    }

    const { direction, pct } = predictionTarget;
    const arrow  = direction === 'up' ? '\u{1F4C8}' : '\u{1F4C9}';
    const action = direction === 'up' ? 'pump' : 'dump';

    predQuestion.innerHTML =
      `${arrow} Will ${currentCoin} ${action} <strong>${pct}%</strong>?<br><span class="pred-hint">Predictions are finalized, rewarded, and reset every 12 hours.</span>`;

    predictionBox.classList.remove('hidden');
  }

  async function handlePrediction(answer) {
    userPrediction = answer;
    if (answer === 'no') {
      predictionTarget.direction = predictionTarget.direction === 'up' ? 'down' : 'up';
    }
    
    // Safety check: is the ticker allowed to be predicted?
    const can = canPredictTicker(currentCoin);
    if (!can.allowed) {
      showToast(can.reason, true);
      predictionBox.classList.add('hidden');
      showReadyPrompt();
      return;
    }

    // Record prediction count/cooldown immediately
    if (currentCoin) recordPrediction(currentCoin);

    // Fire-and-forget: save to server in background — prediction already locked in locally
    if (currentCoin && predictionTarget && rawPrices.length > 0) {
      savePrediction(rawPrices[rawPrices.length - 1]).catch(err => {
        console.warn('savePrediction server error:', err.message);
      });
    }
    predictionBox.classList.add('hidden');
    showReadyPrompt();
  }

  // ─────────────────────────────────────────────────────────
  // READY PROMPT
  // ─────────────────────────────────────────────────────────

  function showReadyPrompt() {
    buildAssetSelector();
    readyPrompt.classList.remove('hidden');
    rideStatusEl.textContent = 'Choose your asset and ride!';
  }

  // ─────────────────────────────────────────────────────────
  // TERRAIN GEOMETRY
  // ─────────────────────────────────────────────────────────

  function rebuildTerrainVertices() {
    terrainVertices = ChartModule.pricesToTerrainVertices(rawPrices, {
      spacing:      TERRAIN_POINT_SPACING,
      canvasHeight: canvas.height,
    });

    // Build checkpoint list — every 10th vertex
    checkpoints = [];
    if (terrainVertices.length > 0) {
      const step = 10;
      for (let i = 0; i < terrainVertices.length; i += step) {
        checkpoints.push(terrainVertices[i].x);
      }
      const lastX = terrainVertices[terrainVertices.length - 1].x;
      if (checkpoints[checkpoints.length - 1] !== lastX) {
        checkpoints.push(lastX);
      }
    }
    lastCheckpointIdx = 0;

    rebuildMinimapVertices();
  }

  function getMinimapRect() {
    return {
      x:      canvas.width - MINIMAP_WIDTH - MINIMAP_MARGIN,
      y:      MINIMAP_MARGIN,
      width:  MINIMAP_WIDTH,
      height: MINIMAP_HEIGHT,
    };
  }

  function rebuildMinimapVertices() {
    minimapVertices = [];
    minimapBounds   = null;

    if (terrainVertices.length === 0) return;

    const rect   = getMinimapRect();
    const minX   = terrainVertices[0].x;
    const maxX   = terrainVertices[terrainVertices.length - 1].x;
    const minY   = Math.min(...terrainVertices.map(v => v.y));
    const maxY   = Math.max(...terrainVertices.map(v => v.y));
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const chartW = rect.width  - MINIMAP_PADDING * 2;
    const chartH = rect.height - MINIMAP_PADDING * 2;

    minimapBounds   = { rect, minX, maxX, minY, maxY, rangeX, rangeY };
    minimapVertices = terrainVertices.map(v => ({
      x:      rect.x + MINIMAP_PADDING + ((v.x - minX) / rangeX) * chartW,
      y:      rect.y + MINIMAP_PADDING + ((v.y - minY) / rangeY) * chartH,
      worldX: v.x,
    }));
  }

  function getTerrainSegmentAtX(worldX) {
    if (terrainVertices.length === 0) return null;
    if (terrainVertices.length === 1) {
      return { start: terrainVertices[0], end: terrainVertices[0], t: 0 };
    }

    const totalWidth = getTotalTrackWidth();
    const wx    = Math.max(0, Math.min(totalWidth, worldX));
    const index = Math.min(
      terrainVertices.length - 2,
      Math.floor(wx / TERRAIN_POINT_SPACING)
    );
    const start = terrainVertices[index];
    const end   = terrainVertices[index + 1];
    const dx    = end.x - start.x || 1;
    const t     = Math.max(0, Math.min(1, (wx - start.x) / dx));

    return { start, end, t };
  }

  function getTerrainPointAtX(worldX) {
    const segment = getTerrainSegmentAtX(worldX);
    if (!segment) {
      return { y: canvas.height - TRACK_BASE_HEIGHT, rotation: 0 };
    }
    const { start, end, t } = segment;
    const y        = start.y + (end.y - start.y) * t;
    const rotation = Math.atan2(end.y - start.y, end.x - start.x);
    return { y, rotation, segment };
  }

  function getTotalTrackWidth() {
    if (terrainVertices.length < 2) return 0;
    return terrainVertices[terrainVertices.length - 1].x;
  }

  function getMinimapPointAtWorldX(worldX) {
    if (!minimapBounds || minimapVertices.length === 0) return null;
    if (minimapVertices.length === 1) return minimapVertices[0];

    const clamped = Math.max(minimapBounds.minX, Math.min(minimapBounds.maxX, worldX));
    const index   = Math.min(
      minimapVertices.length - 2,
      Math.floor(clamped / TERRAIN_POINT_SPACING)
    );
    const start = minimapVertices[index];
    const end   = minimapVertices[index + 1];
    const dx    = end.worldX - start.worldX || 1;
    const t     = Math.max(0, Math.min(1, (clamped - start.worldX) / dx));

    return {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    };
  }

  // ─────────────────────────────────────────────────────────
  // MINIMAP DRAWING
  // ─────────────────────────────────────────────────────────

  function drawMinimap(playerWorldX) {
    if (minimapVertices.length < 2 || !minimapBounds) return;

    const rect = getMinimapRect();
    const dot  = getMinimapPointAtWorldX(playerWorldX);

    ctx.save();

    ctx.fillStyle   = 'rgba(12, 13, 20, 0.82)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth   = 1;
    drawRoundRect(rect.x, rect.y, rect.width, rect.height, 8);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    minimapVertices.forEach((v, i) => {
      if (i === 0) ctx.moveTo(v.x, v.y);
      else ctx.lineTo(v.x, v.y);
    });
    ctx.strokeStyle = 'rgba(0, 229, 160, 0.88)';
    ctx.lineWidth   = 2;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.stroke();

    const start = minimapVertices[0];
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.beginPath();
    ctx.arc(start.x, start.y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    if (dot) {
      ctx.shadowColor = 'rgba(255, 180, 64, 0.95)';
      ctx.shadowBlur  = 8;
      ctx.fillStyle   = '#ffb240';
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur  = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawRoundRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ─────────────────────────────────────────────────────────
  // CHART PREVIEW (pre-ride view)
  // ─────────────────────────────────────────────────────────

  function drawChartPreview() {
    if (rawPrices.length === 0) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const PAD_LEFT   = 60;
    const PAD_RIGHT  = 20;
    const PAD_TOP    = 30;
    const PAD_BOTTOM = 40;
    const W = canvas.width  - PAD_LEFT - PAD_RIGHT;
    const H = canvas.height - PAD_TOP  - PAD_BOTTOM;

    const min   = Math.min(...rawPrices);
    const max   = Math.max(...rawPrices);
    const range = max - min || 1;
    const n     = rawPrices.length;

    function toX(i) { return PAD_LEFT + (i / (n - 1)) * W; }
    function toY(p) { return PAD_TOP + H - ((p - min) / range) * H; }

    const grad = ctx.createLinearGradient(0, PAD_TOP, 0, PAD_TOP + H);
    grad.addColorStop(0, 'rgba(0, 229, 160, 0.25)');
    grad.addColorStop(1, 'rgba(0, 229, 160, 0.02)');

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(rawPrices[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(toX(i), toY(rawPrices[i]));
    ctx.lineTo(toX(n - 1), PAD_TOP + H);
    ctx.lineTo(toX(0), PAD_TOP + H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = '#00e5a0';
    ctx.lineWidth   = 2.5;
    ctx.lineJoin    = 'round';
    ctx.moveTo(toX(0), toY(rawPrices[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(toX(i), toY(rawPrices[i]));
    ctx.stroke();

    ctx.fillStyle = '#00e5a0';
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.arc(toX(i), toY(rawPrices[i]), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    const LEVELS = 5;
    ctx.textAlign = 'right';
    ctx.font = '11px Segoe UI, system-ui, sans-serif';
    for (let l = 0; l <= LEVELS; l++) {
      const val = min + (range * l) / LEVELS;
      const y   = toY(val);

      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(PAD_LEFT, y);
      ctx.lineTo(PAD_LEFT + W, y);
      ctx.stroke();

      ctx.fillStyle = '#8b949e';
      ctx.fillText(formatPrice(val), PAD_LEFT - 6, y + 4);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#8b949e';
    ctx.font      = '11px Segoe UI, system-ui, sans-serif';
    const labelIdxs  = [0, Math.floor((n - 1) / 2), n - 1];
    labelIdxs.forEach(i => {
      const ts = rawTimestamps && rawTimestamps[i] ? rawTimestamps[i] : null;
      const date = ts ? new Date(ts) : new Date(Date.now() - (n - 1 - i) * 86400000);
      const label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      ctx.fillText(label, toX(i), PAD_TOP + H + 20);
    });

    ChartModule.drawHoverMarker(ctx);
  }

  function formatPrice(val) {
    if (val >= 1000) return '$' + val.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (val >= 1)    return '$' + val.toFixed(2);
    return '$' + val.toFixed(4);
  }

  // ─────────────────────────────────────────────────────────
  // SCENE DRAWING (ride mode)
  // ─────────────────────────────────────────────────────────

  function drawScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Speed-based zoom (FOV effect)
    const speed = Math.hypot(physics.vx, physics.vy);
    const zoomTarget = 1 + Math.min(speed / 30, 0.08);
    physics._zoom = physics._zoom || 1;
    physics._zoom += (zoomTarget - physics._zoom) * 0.1;
    const bikeSx = physics.x - cameraX;
    const bikeSy = physics.y - cameraY;
    ctx.save();
    ctx.translate(bikeSx, bikeSy);
    ctx.scale(physics._zoom, physics._zoom);
    ctx.translate(-bikeSx, -bikeSy);

    if (terrainVertices.length === 0) {
      const size = 200;
      ctx.beginPath();
      ctx.strokeStyle = '#00e5a0';
      ctx.lineWidth   = 2.5;
      ctx.moveTo(0, canvas.height - TRACK_BASE_HEIGHT);
      ctx.lineTo(canvas.width, canvas.height - TRACK_BASE_HEIGHT);
      ctx.stroke();

      ctx.lineTo(canvas.width, canvas.height);
      ctx.lineTo(0, canvas.height);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0, 229, 160, 0.08)';
      ctx.fill();

      ctx.drawImage(
        homeImage,
        canvas.width / 2 - size / 2,
        canvas.height - TRACK_BASE_HEIGHT - size,
        size, size
      );
      return;
    }

    const firstIdx = Math.max(0, Math.floor(cameraX / TERRAIN_POINT_SPACING) - 1);
    const lastIdx  = Math.min(
      terrainVertices.length - 1,
      Math.ceil((cameraX + canvas.width) / TERRAIN_POINT_SPACING) + 1
    );

    // Terrain fill
    ctx.beginPath();
    for (let i = firstIdx; i <= lastIdx; i++) {
      const v       = terrainVertices[i];
      const screenX = v.x - cameraX;
      const screenY = v.y - cameraY;
      if (i === firstIdx) ctx.moveTo(screenX, screenY);
      else ctx.lineTo(screenX, screenY);
    }
    ctx.strokeStyle = '#00e5a0';
    ctx.lineWidth   = 3;
    ctx.lineJoin    = 'miter';
    ctx.stroke();

    const firstV = terrainVertices[firstIdx];
    const lastV  = terrainVertices[lastIdx];
    ctx.lineTo(lastV.x  - cameraX, canvas.height);
    ctx.lineTo(firstV.x - cameraX, canvas.height);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 229, 160, 0.08)';
    ctx.fill();

    // Nitro particles
    for (const p of nitroParticles) {
      const px = p.x - cameraX;
      const py = p.y - cameraY;
      const alpha = p.life / p.maxLife;
      const size = p.size * alpha;
      const r = Math.round(p.r * alpha + 255 * (1 - alpha));
      const g = Math.round(p.g * alpha + 100 * (1 - alpha));
      const b = Math.round(p.b * alpha);
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.8})`;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1, size), 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw checkpoint markers
    ctx.fillStyle = 'rgba(255, 180, 64, 0.25)';
    ctx.strokeStyle = 'rgba(255, 180, 64, 0.4)';
    ctx.lineWidth = 1;
    for (let i = 1; i < checkpoints.length - 1; i++) {
      const cx = checkpoints[i] - cameraX;
      if (cx < -20 || cx > canvas.width + 20) continue;
      const seg = getTerrainSegmentAtX(checkpoints[i]);
      if (!seg) continue;
      const groundY = seg.start.y + (seg.end.y - seg.start.y) * seg.t - cameraY;
      ctx.beginPath();
      ctx.moveTo(cx, groundY);
      ctx.lineTo(cx, groundY + 16);
      ctx.stroke();
    }
    // Highlight last checkpoint
    if (lastCheckpointIdx > 0 && lastCheckpointIdx < checkpoints.length - 1) {
      const cx = checkpoints[lastCheckpointIdx] - cameraX;
      const seg = getTerrainSegmentAtX(checkpoints[lastCheckpointIdx]);
      if (seg) {
        const groundY = seg.start.y + (seg.end.y - seg.start.y) * seg.t - cameraY;
        ctx.fillStyle = 'rgba(0, 229, 160, 0.3)';
        ctx.strokeStyle = '#00e5a0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, groundY);
        ctx.lineTo(cx, groundY + 20);
        ctx.stroke();
      }
    }

    // Draw start and finish flags
    const flagW = 72;
    const flagH = 108;
    if (startFlagImg.complete) {
      const startV = terrainVertices[0];
      ctx.drawImage(startFlagImg, startV.x - cameraX - flagW / 2 + 80, startV.y - cameraY - flagH, flagW, flagH);
    }
    if (finishFlagImg.complete && terrainVertices.length > 1) {
      const endV = terrainVertices[terrainVertices.length - 1];
      ctx.drawImage(finishFlagImg, endV.x - cameraX - flagW / 2 - 100, endV.y - cameraY - flagH, flagW, flagH);
    }

    // Draw vehicle at chassis CoM
    const drawAsset     = AssetModule.createAsset();
    drawAsset.width     = RIDE_ASSET_SIZE;
    drawAsset.height    = RIDE_ASSET_SIZE;
    drawAsset.x         = physics.x - cameraX;
    drawAsset.y         = physics.y - cameraY;
    drawAsset.rotation  = physics.angle;

    AssetModule.drawAsset(ctx, drawAsset, assetImages[selectedAssetId]);

    // Flip Visual Feedback
    if (flipTextTimer > 0) {
       flipTextTimer--;
       ctx.save();
       ctx.fillStyle = `rgba(255, 180, 64, ${flipTextTimer / 60})`;
       ctx.font = 'bold 24px sans-serif';
       ctx.textAlign = 'center';
       ctx.shadowColor = '#000';
       ctx.shadowBlur = 4;
       // Float up over time
       const floatY = physics.y - cameraY - 70 - (60 - flipTextTimer);
        ctx.fillText('FLIP! +5% NITRO', physics.x - cameraX, floatY);
        ctx.restore();
    }

    ctx.restore();

    drawMinimap(physics.x);
  }

  // ─────────────────────────────────────────────────────────
  // CAMERA — velocity look-ahead + impact shake
  // ─────────────────────────────────────────────────────────

  function updateCamera() {
    // Look-ahead shifts the view right proportional to current vx
    const lookAhead  = physics.vx * CAM_LOOKAHEAD_SCALE;
    const targetCamX = physics.x + lookAhead - canvas.width  * BIKE_SCREEN_X;
    const targetCamY = physics.y             - canvas.height * BIKE_SCREEN_Y;

    physics.smoothCamX += (targetCamX - physics.smoothCamX) * CAM_LERP_X;
    physics.smoothCamY += (targetCamY - physics.smoothCamY) * CAM_LERP_Y;

    // Shake decays over frames (set by landing impact or crash)
    const shakeX = (Math.random() - 0.5) * physics.camShake * 3;
    const shakeY = (Math.random() - 0.5) * physics.camShake * 2;

    cameraX = Math.max(0, physics.smoothCamX + shakeX);
    cameraY = physics.smoothCamY + shakeY;
  }

  // ─────────────────────────────────────────────────────────
  // GAME LOOP
  // ─────────────────────────────────────────────────────────

  function gameLoop() {
    if (!isRiding) return;

    if (isPaused) {
      animationFrameId = requestAnimationFrame(gameLoop);
      return;
    }

    stepPhysics();

    // Spawn & update nitro particles
    if (keys.nitro && physics.nitro > 0) {
      nitroSpawnTimer--;
      if (nitroSpawnTimer <= 0) {
        nitroSpawnTimer = 5;
        const rearWheel = getAxlePos(physics.x, physics.y, physics.angle, -1);
        const baseVx = -Math.cos(physics.angle) * 2;
        const baseVy = -Math.sin(physics.angle) * 2;
        const flameColors = [
          { r: 255, g: 220, b: 50  },
          { r: 255, g: 80,  b: 20  },
          { r: 255, g: 150, b: 10  },
        ];
        for (const c of flameColors) {
          nitroParticles.push({
            x: rearWheel.x + (Math.random() - 0.5) * 6,
            y: rearWheel.y + (Math.random() - 0.5) * 6,
            vx: baseVx + (Math.random() - 0.5) * 3,
            vy: baseVy + (Math.random() - 0.5) * 3 - 1,
            life: 1,
            maxLife: 1,
            size: 3 + Math.random() * 5,
            ...c,
          });
        }
      }
    }

    // Update existing particles
    for (let i = nitroParticles.length - 1; i >= 0; i--) {
      const p = nitroParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.04;
      p.life -= 0.025;
      p.size *= 0.96;
      if (p.life <= 0) nitroParticles.splice(i, 1);
    }

    // Checkpoint tracking
    for (let i = lastCheckpointIdx + 1; i < checkpoints.length; i++) {
      if (physics.x >= checkpoints[i]) {
        lastCheckpointIdx = i;
      }
    }

    // Update distance HUD
    const d = Math.floor(Math.max(distance, physics.x) / 10);
    distance = Math.max(distance, physics.x);
    if (distanceScoreEl) distanceScoreEl.textContent = d;

    // Update Nitro UI
    if (nitroBarFill) {
       nitroBarFill.style.width = physics.nitro + '%';
       if (keys.nitro && physics.nitro > 0) {
          nitroBarFill.style.backgroundColor = '#ff5500';
          nitroBarFill.style.boxShadow = '0 0 10px #ff5500';
       } else {
          nitroBarFill.style.backgroundColor = '#39d353';
          nitroBarFill.style.boxShadow = 'none';
       }
    }

    // Update engine sound


    // Update Live Timer UI (exclude paused time)
    if (rideStartTime !== null && rideLiveTimer) {
      const elapsed = performance.now() - rideStartTime - pausedDuration;
      const minutes = Math.floor(elapsed / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      const tenths  = Math.floor((elapsed % 1000) / 100);
      
      const mm = String(minutes).padStart(2, '0');
      const ss = String(seconds).padStart(2, '0');
      
      rideLiveTimer.textContent = `${mm}:${ss}.${tenths}`;
    }

    // Check crash
    if (physics.crashed) {
      Sound.crash();
      physics.camShake = 20;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      crashCount++;
      const cpX = checkpoints[lastCheckpointIdx] || 0;
      setTimeout(() => startRide(cpX), 300);
      return;
    }

    // Check end of track
    const totalWidth = getTotalTrackWidth();
    if (physics.x >= totalWidth - 5) {
      Sound.victory();
      endRide();
      return;
    }

    updateCamera();
    drawScene();
    animationFrameId = requestAnimationFrame(gameLoop);
  }

  // ─────────────────────────────────────────────────────────
  // RIDE CONTROL
  // ─────────────────────────────────────────────────────────

  function startRide(startX) {
    if (terrainVertices.length === 0) return;

    pendingVictory = false;
    enterRideMode();
    readyPrompt.classList.add('hidden');

    isRiding = true; checkOrientation();
    rideStatusEl.textContent = 'Riding… ↑/W = Gas  ←/→ = Tilt  Space = Jump';

    const spawnX = startX || 0;
    distance = 0;
    cameraX  = 0;
    cameraY  = 0;
    nitroParticles.length = 0;
    nitroSpawnTimer = 0;
    if (!startX) {
      lastCheckpointIdx = 0;
      pausedDuration = 0;
      pauseStartTime = null;
      rideStartTime = performance.now();
    }

    resetPhysics(spawnX);
    updateCamera();

    if (userPrediction !== null && predictionTarget !== null) {
      const answerLabel = userPrediction === 'yes' ? '\u2705 Yes' : '\u274C No';
      const dirSymbol = predictionTarget.direction === 'up' ? '\u25B2' : '\u25BC';
      predResultText.textContent = `${answerLabel} — ${dirSymbol} ${predictionTarget.direction}`;
      predResultHud.style.display = '';
    }

    gameLoop();
  }

  let pendingVictory      = false;
  let pendingVictoryTime  = '';
  let pendingVictoryDistance = '';
  let pendingVictoryRide  = '';
  let pendingVictoryCrashes = '';
  let pendingRideReward   = 0;

  async function endRide() {
    isRiding = false; checkOrientation();
    isPaused = false;
    pausedDuration = 0;
    pauseStartTime = null;
    pauseOverlay.classList.add('hidden');
    nitroParticles.length = 0;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    Sound.engineStop();

    const finalDistance = Math.floor(Math.max(distance, physics.x) / 10);

    if (walletAddress && selectedAssetId === 'scooter' && !isAssetUnlocked('rabbit')) {
      unlockAsset('rabbit');
      buildAssetSelector();
    }

    const assetDef   = ASSETS.find(b => b.id === selectedAssetId);
    const elapsed    = performance.now() - (rideStartTime || performance.now()) - pausedDuration;
    const elapsedSec = elapsed / 1000;
    lastRideDuration = Math.round(elapsedSec);

    // Apply asset max reward and time bonus (same for all users)
    const assetMax  = assetDef ? assetDef.maxReward : 100;
    const timeBonus = calcTimeBonus(elapsedSec);
    const rideEarned = assetMax * timeBonus;

    if (walletAddress && currentCoin) {
      // await LeaderboardModule.submitScore(walletAddress, currentCoin, finalDistance);
      // await LeaderboardModule.loadLeaderboard();
    }

    // Build victory overlay stats
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    const tenths = Math.floor((elapsed % 1000) / 100);
    const vTime     = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
    const vDist     = `${finalDistance} m`;
    const vRide     = `+${rideEarned.toFixed(rideEarned < 1 ? 4 : 2)} RIDE`;
    const vCrashes  = String(crashCount);

    document.getElementById('victoryTime').textContent = vTime;
    document.getElementById('victoryDistance').textContent = vDist;
    document.getElementById('victoryRide').textContent = vRide;
    document.getElementById('victoryCrashes').textContent = vCrashes;

    const claimBtn = document.getElementById('victoryClaimBtn');
    const newTrackBtn = document.getElementById('victoryNewTrackBtn');
    const subtitle = document.getElementById('victorySubtitle');

    const assetLabel = ASSETS.find(a => a.id === selectedAssetId)?.label || 'Retry';
    victoryRetryBtn.textContent = 'Retry ' + assetLabel;
    claimBtn.classList.remove('hidden');
    newTrackBtn.classList.add('hidden');

    if (walletAddress) {
      claimBtn.textContent = 'Claim Rewards';
      subtitle.textContent = 'Claim rewards to lock them in, or retry for a better reward.';
    } else {
      claimBtn.textContent = 'Connect Wallet';
      subtitle.textContent = 'Connect a wallet to lock in rewards, or retry for a better score.';
      pendingVictory = true;
      pendingVictoryTime = vTime;
      pendingVictoryDistance = vDist;
      pendingVictoryRide = vRide;
      pendingVictoryCrashes = vCrashes;
    }
    // Store rideEarned for the claim handler
    pendingRideReward = rideEarned;

    victoryOverlay.classList.remove('hidden');
  }

  function resetRide() {
    pendingVictory = false;
    pendingRideReward = 0;
    isRiding = false; checkOrientation();
    isPaused = false;
    pausedDuration = 0;
    pauseStartTime = null;
    pauseOverlay.classList.add('hidden');
    victoryOverlay.classList.add('hidden');
    const claimBtn = document.getElementById('victoryClaimBtn');
    claimBtn.disabled = false;
    claimBtn.textContent = 'Claim Rewards';
    claimBtn.style.background = '';
    claimBtn.style.color = '';
    claimBtn.style.boxShadow = '';
    nitroParticles.length = 0;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    Sound.engineStop();

    exitRideMode();

    cameraX  = 0;
    cameraY  = 0;
    distance = 0;

    keys.gas       = false;
    keys.tiltLeft  = false;
    keys.tiltRight = false;
    keys.jump      = false;

    resetPhysics(0);

    distanceScoreEl.textContent  = '0';
    rideStatusEl.textContent = terrainVertices.length > 0 ? 'Ready to ride!' : 'Idle';

    if (rawPrices.length > 0) drawChartPreview();
    else drawScene();
  }

  // ─────────────────────────────────────────────────────────
  // PAUSE
  // ─────────────────────────────────────────────────────────

  const pauseOverlay = document.getElementById('pauseOverlay');
  const pauseResumeBtn = document.getElementById('pauseResumeBtn');
  const pauseRestartBtn = document.getElementById('pauseRestartBtn');
  const pauseQuitBtn = document.getElementById('pauseQuitBtn');

  function togglePause() {
    if (!isRiding) return;
    isPaused = !isPaused;
    pauseOverlay.classList.toggle('hidden', !isPaused);
    if (isPaused) {
      pauseStartTime = performance.now();
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      Sound.pause();
    } else {
      // Accumulate pause duration when resuming
      if (pauseStartTime !== null) {
        pausedDuration += performance.now() - pauseStartTime;
        pauseStartTime = null;
      }
      animationFrameId = requestAnimationFrame(gameLoop);
      Sound.resume();
    }
  }

  function pauseResume() {
    if (!isPaused) return;
    togglePause();
  }

  function pauseRestart() {
    isPaused = false;
    crashCount = 0;
    pauseOverlay.classList.add('hidden');
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    Sound.resume();
    startRide();
  }

  function pauseQuit() {
    isPaused = false;
    pauseOverlay.classList.add('hidden');
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    Sound.resume();
    resetRide();
  }

  pauseResumeBtn.addEventListener('click', pauseResume);
  pauseRestartBtn.addEventListener('click', pauseRestart);
  pauseQuitBtn.addEventListener('click', pauseQuit);

  victoryRetryBtn.addEventListener('click', () => {
    victoryOverlay.classList.add('hidden');
    crashCount = 0;
    startRide();
  });
  document.getElementById('victoryClaimBtn').addEventListener('click', async () => {
    if (!walletAddress) {
      showWalletModal('Connect wallet to claim RIDE rewards.');
      return;
    }
    const btn = document.getElementById('victoryClaimBtn');
    const reward = pendingRideReward || 0;
    // Show claiming state
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Claiming...';
    let claimed = false;
    // Connected user: claim via API
    if (API.getToken() && currentCoin && reward > 0) {
      try {
        const captchaToken = await getTurnstileToken();
        const data = await API.claimRideReward(currentCoin, reward, selectedAssetId, userPrediction !== null, lastRideDuration, captchaToken);
        if (data.success) {
          claimed = true;
        }
      } catch (err) {
        showToast('Failed to claim: ' + err.message, true);
        btn.disabled = false;
        btn.textContent = 'Claim Rewards';
        return;
      }
    } else if (reward > 0) {
      addRideBalance(reward);
      claimed = true;
    }
    // Mark asset as used on this ticker
    if (currentCoin && selectedAssetId) markAssetUsed(selectedAssetId, currentCoin);
    // Unlock rabbit if scooter was used
    if (selectedAssetId === 'scooter' && walletAddress && !isAssetUnlocked('rabbit')) {
      unlockAsset('rabbit');
    }
    // Show claimed state
    btn.innerHTML = '\u2713 Claimed';
    btn.style.background = 'rgba(0, 229, 160, 0.12)';
    btn.style.color = '#00e5a0';
    btn.style.boxShadow = 'none';
    setTimeout(() => {
      victoryOverlay.classList.add('hidden');
      pendingVictory = false;
      pendingRideReward = 0;
      // Refresh balance and unclaimed from on-chain after claim
      if (walletAddress && API.getToken()) {
        API.syncBalance().then(r => {
          rideBalance = r.rideBalance;
          saveRideBalance();
          if (typeof r.unclaimedTotal === 'number') {
            unclaimedRewards = r.unclaimedTotal;
            saveUnclaimedRewards();
          }
        }).catch(() => {});
      }
      showToast('Rewards locked in! +' + reward.toFixed(reward < 1 ? 4 : 2) + ' RIDE');
      LeaderboardModule.loadLeaderboard();
      resetRide();
    }, 1500);
  });

  // ─────────────────────────────────────────────────────────
  // KEYBOARD INPUT
  // ─────────────────────────────────────────────────────────

  document.addEventListener('keydown', e => {
    // Skip game keys when typing in an input
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        if (!document.getElementById('introModal').classList.contains('hidden')) {
          document.getElementById('introModal').classList.add('hidden');
          resetRide();
        } else if (rotateOverlay.classList.contains('hidden')) {
          togglePause();
        }
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
        e.preventDefault();
        keys.gas = true;
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault();
        keys.tiltLeft = true;
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault();
        keys.tiltRight = true;
        break;
      case 'Shift':
      case 'n':
      case 'N':
        e.preventDefault();
        keys.nitro = true;
        break;
      case ' ':
        e.preventDefault();
        keys.jump = true;
        break;
      case 'r':
      case 'R':
        e.preventDefault();
        if (isRiding) {
          if (animationFrameId) cancelAnimationFrame(animationFrameId);
          startRide();
        }
        break;
      case 'm':
      case 'M':
        e.preventDefault();
        Sound.toggle();
        showToast(Sound.isEnabled() ? 'Sound on' : 'Sound off');
        break;
    }
  });

  document.addEventListener('keyup', e => {
    // Skip game keys when typing in an input
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    switch (e.key) {
      case 'ArrowUp':   case 'w': case 'W': keys.gas       = false; break;
      case 'ArrowLeft': case 'a': case 'A': keys.tiltLeft  = false; break;
      case 'ArrowRight':case 'd': case 'D': keys.tiltRight = false; break;
      case 'Shift':     case 'n': case 'N': keys.nitro     = false; break;
    }
  });

  // ─────────────────────────────────────────────────────────
  // MOBILE TOUCH INPUT
  // Left half  → tilt (left edge = tilt left, right edge = tilt right)
  // Right half → bottom 60% = gas (hold), top 40% = nitro (tap)
  // Double tap → jump
  // ─────────────────────────────────────────────────────────

  const touchMap = {}; // touch.identifier → zone
  let touchCount    = 0;
  let lastTapTime   = 0;
  const DOUBLE_TAP_MS = 300;

  function getTouchZone(relX, relY) {
    if (relX < 0.5) return relX < 0.2 ? 'tiltLeft' : 'tiltRight';
    return relY > 0.4 ? 'gas' : 'nitro';
  }

  canvas.addEventListener('touchstart', e => {
    if (e.cancelable) e.preventDefault();
    const rect = canvas.getBoundingClientRect();

    for (const touch of e.changedTouches) {
      const relX = (touch.clientX - rect.left) / rect.width;
      const relY = (touch.clientY - rect.top)  / rect.height;
      const zone = getTouchZone(relX, relY);
      touchMap[touch.identifier] = zone;
      keys[zone] = true;
      touchCount++;

      // Tilt zones are mutually exclusive
      if (zone === 'tiltLeft')  keys.tiltRight = false;
      if (zone === 'tiltRight') keys.tiltLeft  = false;
    }

    // Double-tap → jump
    if (touchCount === 1) {
      const now = performance.now();
      if (now - lastTapTime < DOUBLE_TAP_MS) {
        keys.jump = true;
      }
      lastTapTime = now;
    }
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    if (e.cancelable) e.preventDefault();
    for (const touch of e.changedTouches) {
      const zone = touchMap[touch.identifier];
      if (zone) {
        keys[zone] = false;
        delete touchMap[touch.identifier];
        touchCount--;
      }
    }
    if (touchCount < 0) touchCount = 0;
  }, { passive: false });

  canvas.addEventListener('touchcancel', e => {
    for (const touch of e.changedTouches) {
      const zone = touchMap[touch.identifier];
      if (zone) {
        keys[zone] = false;
        delete touchMap[touch.identifier];
        touchCount--;
      }
    }
    if (touchCount < 0) touchCount = 0;
  }, { passive: false });

  // ─────────────────────────────────────────────────────────
  // EVENT LISTENERS
  // ─────────────────────────────────────────────────────────

  loadChartBtn.addEventListener('click', () => { loadChart(); });

  // Ticker autocomplete
  const suggestionsEl = document.getElementById('suggestions');
  let suggestionIndex = -1;

  tickerInput.addEventListener('input', () => {
    const val = tickerInput.value.trim();
    if (!val) {
      suggestionsEl.classList.add('hidden');
      suggestionIndex = -1;
      return;
    }
    const results = ChartModule.searchCoins(val);
    if (results.length === 0) {
      suggestionsEl.classList.add('hidden');
      suggestionIndex = -1;
      return;
    }
    suggestionsEl.innerHTML = results.map((r, i) =>
      `<div class="suggestion-item${i === suggestionIndex ? ' active' : ''}" data-index="${i}">
        <span class="suggestion-symbol">${r.symbol}</span>
        <span class="suggestion-name">${r.name}</span>
      </div>`
    ).join('');
    suggestionsEl.classList.remove('hidden');
  });

  tickerInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (suggestionIndex >= 0) {
        const items = suggestionsEl.querySelectorAll('.suggestion-item');
        const selected = items[suggestionIndex];
        if (selected) {
          tickerInput.value = selected.querySelector('.suggestion-symbol').textContent;
        }
      }
      suggestionsEl.classList.add('hidden');
      suggestionIndex = -1;
      loadChart();
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const items = suggestionsEl.querySelectorAll('.suggestion-item');
      if (items.length === 0) return;
      suggestionIndex = (suggestionIndex + 1) % items.length;
      items.forEach((el, i) => el.classList.toggle('active', i === suggestionIndex));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const items = suggestionsEl.querySelectorAll('.suggestion-item');
      if (items.length === 0) return;
      suggestionIndex = (suggestionIndex - 1 + items.length) % items.length;
      items.forEach((el, i) => el.classList.toggle('active', i === suggestionIndex));
    }
    if (e.key === 'Escape') {
      suggestionsEl.classList.add('hidden');
      suggestionIndex = -1;
    }
  });

  // Click a suggestion
  suggestionsEl.addEventListener('mousedown', e => {
    const item = e.target.closest('.suggestion-item');
    if (!item) return;
    tickerInput.value = item.querySelector('.suggestion-symbol').textContent;
    suggestionsEl.classList.add('hidden');
    suggestionIndex = -1;
    loadChart();
  });

  // Hide suggestions when clicking outside
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-input-wrap')) {
      suggestionsEl.classList.add('hidden');
      suggestionIndex = -1;
    }
  });

  // Refresh chart data without resetting prediction/ride state
  async function refreshChartData() {
    try {
      const prices = await ChartModule.fetchPriceData(currentCoin);
      rawPrices = prices;
      const series = ChartModule.getCurrentSeries();
      rawTimestamps = series.map(s => s.time);
      rebuildTerrainVertices();
      chartTimeframeText.textContent = ChartModule.getActiveTimeframe() || '3M';
      drawChartPreview();
    } catch (err) {
      console.error('refreshChartData:', err);
    }
  }

  timeframeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tf = btn.dataset.timeframe;
      if (!tf) return;
      
      // Show coming soon modal for ALL timeframe
      if (tf === 'ALL') {
        document.getElementById('comingSoonModal').classList.remove('hidden');
        return;
      }
      
      ChartModule.setTimeframe(tf);  // triggers onTimeframeChange which toggles button classes
      if (currentCoin && rawPrices.length > 0) {
        if (userPrediction !== null) {
          refreshChartData();
        } else {
          loadChart();
        }
      }
    });
  });

  ChartModule.onTimeframeChange(() => {
    const activeTf = ChartModule.getActiveTimeframe();
    timeframeBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.timeframe === activeTf);
    });
    // Data fetching is handled by the click handler — avoid duplicate calls
  });

  resetRideBtn.addEventListener('click', () => {
    document.getElementById('introModal').classList.add('hidden');
    predictionBox.classList.add('hidden');
    readyPrompt.classList.add('hidden');
    predResultHud.style.display = 'none';
    userPrediction   = null;
    predictionTarget = null;
    rawPrices        = [];
    rawTimestamps    = [];
    terrainVertices  = [];
    currentCoin      = null;
    currentCoinEl.textContent = '--';
    chartNameText.textContent = '--';
    chartTimeframeText.textContent = '3M';
    rideStatusEl.textContent  = 'Idle';
    resetRide();
  });

  predYesBtn.addEventListener('click', () => { handlePrediction('yes'); });
  predNoBtn.addEventListener('click',  () => { handlePrediction('no'); });
  confirmRideBtn.addEventListener('click', () => {
    // Check if selected asset is available for this ticker
    if (currentCoin && !isAssetAvailable(selectedAssetId, currentCoin)) {
      showToast(selectedAssetId + ' not available on ' + currentCoin, true);
      return;
    }
    // Populate intro modal with asset-specific rewards
    const assetDef = ASSETS.find(b => b.id === selectedAssetId);
    const maxR = assetDef ? assetDef.maxReward : 100;
    document.getElementById('introMaxReward').textContent = maxR;
    document.getElementById('introRewardFull').textContent = maxR;
    document.getElementById('introReward30').textContent  = Math.round(maxR * 0.9);
    document.getElementById('introReward35').textContent  = Math.round(maxR * 0.8);
    document.getElementById('introReward45').textContent  = Math.round(maxR * 0.6);
    document.getElementById('introRewardMin').textContent = Math.round(maxR * 0.1);
    // Enter ride mode so canvas shows, then display intro overlay
    enterRideMode();
    document.getElementById('introModal').classList.remove('hidden');
  });

  document.getElementById('introStartBtn').addEventListener('click', () => {
    document.getElementById('introModal').classList.add('hidden');
    crashCount = 0;
    startRide();
  });

  // Coming soon modal for ALL timeframe
  document.getElementById('comingSoonOkBtn').addEventListener('click', () => {
    document.getElementById('comingSoonModal').classList.add('hidden');
    // Reset to 3M timeframe
    ChartModule.setTimeframe('3M');
    // Update button states
    timeframeBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.timeframe === '3M');
    });
    // Refresh chart if data exists
    if (currentCoin && rawPrices.length > 0) {
      if (userPrediction !== null) {
        refreshChartData();
      } else {
        loadChart();
      }
    }
  });

  // ─────────────────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────────────────

  // Restore saved wallet session
  // Restore saved wallet session — retry with delay for async wallet injection
  (async function restoreWallet() {
    const saved = localStorage.getItem('cr_wallet');
    if (!saved) return;

    // Try to restore with existing JWT first — validate against server
    const existingToken = API.getToken();
    if (existingToken) {
      try {
        // Actually validate the token — if expired or wrong wallet, this throws
        const profile = await API.getProfile();
        // Ensure the saved wallet matches the authenticated profile
        // EVM addresses are case-insensitive; Solana base58 addresses are case-sensitive
        const isEVM = saved.startsWith('0x');
        const walletMatches = profile.wallet && (
          isEVM
            ? profile.wallet.toLowerCase() === saved.toLowerCase()
            : profile.wallet === saved
        );
        if (!profile || !walletMatches) {
          throw new Error('Wallet mismatch');
        }
        walletAddress = saved;
        // Token valid — show dashboard immediately, background sync
        connectWalletBtn.classList.add('hidden');
        walletDashboard.classList.remove('hidden');
        ['cr_daily_preds', 'cr_ticker_cooldowns'].forEach(k => localStorage.removeItem(k));
        syncFromServer().then(() => {
          if (currentCoin) buildAssetSelector();
          syncUnsyncedPredictions();
          syncUnsyncedUsedAssets();
        });
        syncPredStateFromServer();
        return;
      } catch (_) {
        // Token expired or mismatched — clear everything and re-auth
        API.clearToken();
        localStorage.removeItem('cr_wallet');
        localStorage.removeItem('cr_wallet_type');
        walletAddress = null;
        connectWalletBtn.classList.remove('hidden');
        walletDashboard.classList.add('hidden');
        return; // Don't tryRestore — make user explicitly connect
      }
    }


    // No valid JWT — try silent wallet reconnect
    async function tryRestore() {
      const walletType = localStorage.getItem('cr_wallet_type');
      const isEVMAddress = saved.startsWith('0x');

      // ── Solana wallet restore ──
      if (!isEVMAddress) {
        // Backpack
        if (walletType === 'backpack' || (!walletType && window.backpack?.isBackpack)) {
          try {
            const bpProvider = window.backpack?.isBackpack ? window.backpack : null;
            if (bpProvider) {
              const resp = await bpProvider.connect({ onlyIfTrusted: true });
              const pk = resp?.publicKey || bpProvider.publicKey;
              if (pk && pk.toString() === saved) {
                localStorage.setItem('cr_wallet_type', 'backpack');
                onWalletConnected(pk.toString());
                return true;
              }
            }
          } catch (_) {}
        }
        if (walletType === 'solflare' || (!walletType && window.solflare?.isSolflare)) {
          try {
            const resp = await window.solflare.connect({ onlyIfTrusted: true });
            if (resp.publicKey && resp.publicKey.toString() === saved) {
              localStorage.setItem('cr_wallet_type', 'solflare');
              onWalletConnected(resp.publicKey.toString());
              return true;
            }
          } catch (_) {}
        }
        const phantomProvider = window.solana?.isPhantom ? window.solana : window.phantom?.solana;
        if (phantomProvider && (walletType === 'phantom' || !walletType)) {
          try {
            const resp = await phantomProvider.connect({ onlyIfTrusted: true });
            if (resp.publicKey && resp.publicKey.toString() === saved) {
              localStorage.setItem('cr_wallet_type', 'phantom');
              onWalletConnected(resp.publicKey.toString());
              return true;
            }
          } catch (_) {}
        }
        return false;
      }

      // ── EVM wallet restore (Trust, WalletConnect) ──
      const evmProvider = getEVMProvider(walletType || 'trust');

      if (evmProvider) {
        try {
          const accounts = await evmProvider.request({ method: 'eth_accounts' });
          if (accounts && accounts[0] && accounts[0].toLowerCase() === saved.toLowerCase()) {
            onWalletConnected(accounts[0]);
            return true;
          }
        } catch (_) {}
      }
      return false;
    }


    if (await tryRestore()) return;
    setTimeout(async () => {
      if (await tryRestore()) return;
      localStorage.removeItem('cr_wallet');
    }, 1500);
  })();

  ChartModule.init(canvas, tooltipEl);
  ChartModule.onRedraw(() => {
    if (rawPrices.length > 0) drawChartPreview();
  });

  // Fetch Turnstile site key
  const turnstileConfigReady = fetch('/api/config').then(r => r.json()).then(cfg => {
    window._turnstileSiteKey = cfg.turnstileSiteKey || '';
    if (!window._turnstileSiteKey) console.warn('Turnstile: missing site key');
  }).catch(() => {});

  let turnstileWidgetId = null;
  function getTurnstileContainer() {
    let container = document.getElementById('turnstile-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'turnstile-container';
      container.className = 'turnstile-box hidden';
    }

    if (walletModal && !walletModal.classList.contains('hidden')) {
      const walletHint = document.getElementById('walletHint');
      if (walletHint && container.parentElement !== walletHint.parentElement) {
        walletHint.parentElement.insertBefore(container, walletHint);
      }
    } else {
      const claimBtn = document.getElementById('victoryClaimBtn');
      const claimButtons = claimBtn ? claimBtn.parentElement : null;
      if (claimButtons && container.parentElement !== claimButtons.parentElement) {
        claimButtons.parentElement.insertBefore(container, claimButtons);
      } else if (!container.parentElement) {
        document.body.appendChild(container);
      }
    }

    container.classList.remove('hidden');
    return container;
  }

  function waitForTurnstileScript(timeoutMs = 5000) {
    if (typeof turnstile !== 'undefined') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        if (typeof turnstile !== 'undefined') {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - startedAt >= timeoutMs) {
          clearInterval(timer);
          reject(new Error('Captcha service did not load. Please disable blockers for this site and try again.'));
        }
      }, 100);
    });
  }

  async function getTurnstileToken() {
    await turnstileConfigReady;
    if (!window._turnstileSiteKey) {
      throw new Error('Captcha is not configured for this site.');
    }
    await waitForTurnstileScript();

    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (err, token) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        const container = document.getElementById('turnstile-container');
        if (!err && container) container.classList.add('hidden');
        if (err) reject(err);
        else resolve(token);
      };
      const timeout = setTimeout(() => {
        finish(new Error('Captcha timed out. Please try again.'));
      }, 120000);

      try {
        const container = getTurnstileContainer();
        if (turnstileWidgetId !== null) {
          turnstile.remove(turnstileWidgetId);
          turnstileWidgetId = null;
        }
        container.innerHTML = '';
        
        turnstileWidgetId = turnstile.render(container, {
          sitekey: window._turnstileSiteKey,
          size: 'normal',
          theme: 'dark',
          callback: (t) => { finish(null, t); },
          'error-callback': () => { finish(new Error('Captcha failed. Please try again.')); },
          'expired-callback': () => { finish(new Error('Captcha expired. Please try again.')); }
        });
      } catch (e) {
        console.warn('Turnstile error:', e);
        finish(new Error('Captcha could not start. Please refresh and try again.'));
      }
    });
  }

  toastEl.addEventListener('click', () => {
    toastEl.classList.add('hidden');
    if (toastTimer) clearTimeout(toastTimer);
  });

  homeImage.onload  = () => drawScene();
  homeImage.onerror = () => drawScene();
  if (homeImage.complete) drawScene();

  // ── Orientation lock ──
  const rotateOverlay = document.getElementById('rotateOverlay');
  let orientationPaused = false;

  function checkOrientation() {
    if (isRiding && window.innerHeight > window.innerWidth) {
      rotateOverlay.classList.remove('hidden');
      if (!isPaused) {
        orientationPaused = true;
        togglePause();
      }
    } else {
      rotateOverlay.classList.add('hidden');
      if (orientationPaused && isPaused) {
        orientationPaused = false;
        togglePause();
      }
      orientationPaused = false;
    }
  }

  window.addEventListener('orientationchange', () => {
    setTimeout(checkOrientation, 300);
  });
  window.addEventListener('resize', checkOrientation);

  LeaderboardModule.loadLeaderboard();
})();

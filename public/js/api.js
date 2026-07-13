// api.js
// Centralized API client for authenticated requests to the backend.
// Handles JWT storage in localStorage and attaches it to all requests.

const API = (() => {

  function getToken() {
    return localStorage.getItem('cr_token');
  }

  function setToken(token) {
    if (token) localStorage.setItem('cr_token', token);
    else localStorage.removeItem('cr_token');
  }

  function clearToken() {
    localStorage.removeItem('cr_token');
  }

  async function request(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const token = getToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body !== undefined) opts.body = JSON.stringify(body);

    const res = await fetch(path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  // Auth
  async function getChallenge(wallet) {
    return request('POST', '/api/auth/challenge', { wallet });
  }

  async function login(wallet, signature, sigType, captchaToken) {
    const data = await request('POST', '/api/auth/login', { wallet, signature, sigType, captchaToken });
    if (data.token) setToken(data.token);
    return data;
  }

  function logout() {
    clearToken();
  }

  // User data
  async function getBalance() {
    return request('GET', '/api/user/balance');
  }

  async function getPredictions() {
    return request('GET', '/api/user/predictions');
  }

  async function createPrediction(pred) {
    return request('POST', '/api/user/predictions', pred);
  }

  async function claimRideReward(coin, reward, assetId, recordPrediction, durationSeconds, captchaToken) {
    return request('POST', '/api/user/ride/claim', { coin, reward, assetId, recordPrediction, durationSeconds, captchaToken });
  }

  async function claimPredictionReward(predId) {
    return request('POST', '/api/user/prediction/claim', { predId });
  }

  async function getProfile() {
    return request('GET', '/api/user/profile');
  }

  async function getUsedAssets() {
    return request('GET', '/api/user/used-assets');
  }

  async function markAssetUsed(assetId, ticker) {
    return request('POST', '/api/user/used-assets', { assetId, ticker });
  }

  async function getUnlockedAssets() {
    return request('GET', '/api/user/unlocked-assets');
  }

  async function unlockAsset(assetId) {
    return request('POST', '/api/user/unlock', { assetId });
  }

  async function getPredState() {
    return request('GET', '/api/user/pred-state');
  }

  async function syncBalance() {
    return request('POST', '/api/user/sync-balance');
  }

  async function resolvePredictions() {
    return request('POST', '/api/user/resolve-predictions');
  }

  async function seedTestHits() {
    return request('POST', '/api/user/test/seed-hits');
  }

  async function getSolanaConfig() {
    return request('GET', '/api/user/solana-config');
  }

  async function getClaimableRewards() {
    return request('GET', '/api/user/claimable-rewards');
  }

  async function claimAll() {
    return request('POST', '/api/user/claim-all');
  }

  return {
    getToken, setToken, clearToken,
    getChallenge, login, logout,
    getBalance, getPredictions, createPrediction,
    claimRideReward, claimPredictionReward,
    getProfile, getUsedAssets, markAssetUsed,
    getUnlockedAssets, unlockAsset, getPredState,
    syncBalance, resolvePredictions, seedTestHits, getSolanaConfig, getClaimableRewards, claimAll,
  };
})();
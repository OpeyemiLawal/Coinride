const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const nacl = require('tweetnacl');
const bs58 = require('bs58').default;
const { ethers } = require('ethers');
const supabase = require('../supabase');
const { JWT_SECRET } = require('../middleware/auth');

// Store challenges in memory
const challenges = new Map();

// POST /api/auth/challenge
router.post('/challenge', (req, res) => {
  const { wallet } = req.body;
  if (!wallet) return res.status(400).json({ error: 'Wallet address required' });

  const nonce = Math.random().toString(36).slice(2, 10);
  const message = `CoinRide auth ${nonce}`;
  challenges.set(wallet, { nonce, message, createdAt: Date.now() });
  setTimeout(() => challenges.delete(wallet), 5 * 60 * 1000);

  res.json({ nonce, message });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { wallet, signature, sigType, captchaToken } = req.body;
  if (!wallet || !signature) {
    return res.status(400).json({ error: 'Wallet and signature required' });
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
        console.warn('Turnstile login verification failed:', verData['error-codes'] || verData);
        return res.status(403).json({ error: 'Captcha verification failed' });
      }
    } catch (_) {
      return res.status(500).json({ error: 'Captcha verification error' });
    }
  }

  const challenge = challenges.get(wallet);
  if (!challenge) {
    return res.status(400).json({ error: 'No challenge found. Request a new one.' });
  }

  let verified = false;
  try {
    if (sigType === 'evm') {
      // MetaMask / EVM
      const signerAddr = ethers.verifyMessage(challenge.message, signature);
      verified = signerAddr.toLowerCase() === wallet.toLowerCase();
    } else {
      // Solana (Phantom) — signature is hex-encoded bytes
      const messageBytes = new TextEncoder().encode(challenge.message);
      const sigBytes = new Uint8Array(signature.match(/.{1,2}/g).map(b => parseInt(b, 16)));
      const publicKeyBytes = bs58.decode(wallet);
      verified = nacl.sign.detached.verify(messageBytes, sigBytes, publicKeyBytes);
    }
  } catch (err) {
    return res.status(400).json({ error: 'Signature verification failed: ' + err.message });
  }

  if (!verified) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  challenges.delete(wallet);

  try {
    const sb = supabase;
    const { error: upsertError } = await sb
      .from('users')
      .upsert({ wallet }, { onConflict: 'wallet', ignoreDuplicates: false });

    if (upsertError) {
      console.error('User upsert failed:', upsertError);
      return res.status(500).json({ error: 'Database error: ' + upsertError.message });
    }

    const token = jwt.sign({ wallet }, JWT_SECRET, { expiresIn: '7d' });

    const { data: user, error: fetchError } = await sb
      .from('users')
      .select('wallet, ride_balance')
      .eq('wallet', wallet)
      .single();

    if (fetchError) {
      console.error('User fetch failed:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch user' });
    }

    res.json({
      token,
      user: { wallet: user.wallet, rideBalance: user.ride_balance },
    });
  } catch (err) {
    console.error('Auth error:', err.message);
    res.status(500).json({ error: 'Authentication service unavailable' });
  }
});

module.exports = router;

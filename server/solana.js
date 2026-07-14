const bs58 = require('bs58').default || require('bs58');

const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
function getTreasurySecret() {
  return (process.env.TREASURY_SECRET_KEY || '').trim();
}

function getRideTokenMint() {
  return (process.env.RIDE_TOKEN_MINT || '').trim();
}

let web3Promise = null;
let splTokenPromise = null;
let connectionPromise = null;
let treasuryKeypair = null;
let treasuryTokenAccount = null;
let treasuryKeyError = null;

async function getWeb3() {
  if (!web3Promise) web3Promise = import('@solana/web3.js');
  return web3Promise;
}

async function getSplToken() {
  if (!splTokenPromise) splTokenPromise = import('@solana/spl-token');
  return splTokenPromise;
}

async function getConnection() {
  if (!connectionPromise) {
    connectionPromise = getWeb3().then(({ Connection }) => new Connection(RPC_URL, 'confirmed'));
  }
  return connectionPromise;
}

async function rpcRequest(method, params) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`RPC request failed (${response.status})`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error.message || 'RPC request failed');
    return payload.result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('RPC request timed out');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function getTreasuryKeypair() {
  if (treasuryKeypair) return treasuryKeypair;
  const treasurySecret = getTreasurySecret();
  if (!treasurySecret) return null;
  try {
    const { Keypair } = await getWeb3();
    const secretBytes = treasurySecret.startsWith('[')
      ? Uint8Array.from(JSON.parse(treasurySecret))
      : bs58.decode(treasurySecret);
    if (secretBytes.length !== 64) {
      throw new Error(`expected a 64-byte Solana private key, received ${secretBytes.length} bytes`);
    }
    treasuryKeypair = Keypair.fromSecretKey(secretBytes);
    return treasuryKeypair;
  } catch (e) {
    treasuryKeyError = e.message;
    console.warn('Invalid TREASURY_SECRET_KEY — claim-all disabled:', e.message);
    return null;
  }
}

function initTreasury() {
  if (!getTreasurySecret()) {
    console.warn('TREASURY_SECRET_KEY not set — claim-all disabled');
    return;
  }
  if (!getRideTokenMint()) {
    console.warn('RIDE_TOKEN_MINT not set — claim-all disabled');
    return;
  }
}

async function ensureTreasuryTokenAccount() {
  const keypair = await getTreasuryKeypair();
  const rideTokenMint = getRideTokenMint();
  if (!keypair || !rideTokenMint) return null;
  if (treasuryTokenAccount) return treasuryTokenAccount;
  try {
    const { PublicKey } = await getWeb3();
    const { getOrCreateAssociatedTokenAccount } = await getSplToken();
    const connection = await getConnection();
    const mintPubkey = new PublicKey(rideTokenMint);
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      mintPubkey,
      keypair.publicKey,
    );
    treasuryTokenAccount = ata.address;
    return ata.address;
  } catch (e) {
    console.warn('Failed to get treasury token account:', e.message);
    return null;
  }
}

async function transferTokens(destinationWallet, amount) {
  if (!getTreasurySecret()) throw new Error('TREASURY_SECRET_KEY is not set');
  const rideTokenMint = getRideTokenMint();
  if (!rideTokenMint) throw new Error('RIDE_TOKEN_MINT is not set');
  const keypair = await getTreasuryKeypair();
  if (!keypair) {
    throw new Error('TREASURY_SECRET_KEY is invalid: ' + (treasuryKeyError || 'unrecognized format'));
  }
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    throw new Error('Invalid transfer amount');
  }

  const { PublicKey, Transaction } = await getWeb3();
  const { getOrCreateAssociatedTokenAccount, createTransferInstruction, getAccount } = await getSplToken();
  const connection = await getConnection();
  const mintPubkey = new PublicKey(rideTokenMint);
  const destPubkey = new PublicKey(destinationWallet);

  // Ensure treasury has a token account
  const treasuryAta = await ensureTreasuryTokenAccount();
  if (!treasuryAta) throw new Error('Cannot access treasury token account');

  // Get or create the user's associated token account
  const destAta = await getOrCreateAssociatedTokenAccount(
    connection,
    keypair,
    mintPubkey,
    destPubkey,
  );

  // Build transfer instruction (amount in raw units, assumes 9 decimals)
  const rawAmount = Math.round(amount * 1_000_000_000);

  // Check treasury balance
  const treasuryAccount = await getAccount(connection, treasuryAta);
  if (Number(treasuryAccount.amount) < rawAmount) {
    throw new Error('Insufficient treasury balance');
  }

  const tx = new Transaction().add(
    createTransferInstruction(
      treasuryAta,
      destAta.address,
      keypair.publicKey,
      rawAmount,
    ),
  );
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = keypair.publicKey;

  const sig = await connection.sendTransaction(tx, [keypair]);
  await connection.confirmTransaction({
    signature: sig,
    blockhash,
    lastValidBlockHeight,
  }, 'confirmed');
  return sig;
}

async function getTokenBalance(walletAddress) {
  const rideTokenMint = getRideTokenMint();
  if (!rideTokenMint) throw new Error('RIDE_TOKEN_MINT not set');
  try {
    const result = await rpcRequest('getTokenAccountsByOwner', [
      walletAddress,
      { mint: rideTokenMint },
      { encoding: 'jsonParsed' },
    ]);
    // Read-only lookup: compute the associated token address without creating
    // it. Creating an ATA costs the treasury SOL rent, and this function is
    // reachable (via /wallet-balance and /sync-balance) for arbitrary
    // addresses an authenticated wallet chooses to query — it should never
    // spend treasury funds just to answer a balance check.
    return (result.value || []).reduce((total, account) => {
      const amount = account.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
      return total + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  } catch (e) {
    if (
      e.name === 'TokenAccountNotFoundError' ||
      e.name === 'TokenInvalidAccountOwnerError' ||
      /could not find account|invalid account owner/i.test(e.message || '')
    ) {
      // No token account yet for this address — balance is simply 0.
      return 0;
    }
    console.error('getTokenBalance error:', e.message);
    throw e;
  }
}

async function getSolBalance(walletAddress) {
  try {
    const result = await rpcRequest('getBalance', [walletAddress, { commitment: 'confirmed' }]);
    return Number(result.value || 0) / 1_000_000_000;
  } catch (e) {
    console.error('getSolBalance error:', e.message);
    throw e;
  }
}

async function getSolBalanceOrZero(walletAddress) {
  try {
    return await getSolBalance(walletAddress);
  } catch (_) {
    return 0;
  }
}

async function getTokenBalanceOrZero(walletAddress) {
  try {
    return await getTokenBalance(walletAddress);
  } catch (_) {
    return 0;
  }
}

initTreasury();

module.exports = { transferTokens, getTokenBalance, getSolBalance, getSolBalanceOrZero, getTokenBalanceOrZero };

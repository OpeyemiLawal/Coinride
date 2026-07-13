const bs58 = require('bs58').default || require('bs58');

const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const TREASURY_SECRET = process.env.TREASURY_SECRET_KEY;
const RIDE_TOKEN_MINT = process.env.RIDE_TOKEN_MINT;

let web3Promise = null;
let splTokenPromise = null;
let connectionPromise = null;
let treasuryKeypair = null;
let treasuryTokenAccount = null;

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

async function getTreasuryKeypair() {
  if (treasuryKeypair) return treasuryKeypair;
  if (!TREASURY_SECRET || !RIDE_TOKEN_MINT) return null;
  try {
    const { Keypair } = await getWeb3();
    treasuryKeypair = Keypair.fromSecretKey(bs58.decode(TREASURY_SECRET));
    return treasuryKeypair;
  } catch (e) {
    console.warn('Invalid TREASURY_SECRET_KEY — claim-all disabled:', e.message);
    return null;
  }
}

function initTreasury() {
  if (!TREASURY_SECRET) {
    console.warn('TREASURY_SECRET_KEY not set — claim-all disabled');
    return;
  }
  if (!RIDE_TOKEN_MINT) {
    console.warn('RIDE_TOKEN_MINT not set — claim-all disabled');
    return;
  }
}

async function ensureTreasuryTokenAccount() {
  const keypair = await getTreasuryKeypair();
  if (!keypair || !RIDE_TOKEN_MINT) return null;
  if (treasuryTokenAccount) return treasuryTokenAccount;
  try {
    const { PublicKey } = await getWeb3();
    const { getOrCreateAssociatedTokenAccount } = await getSplToken();
    const connection = await getConnection();
    const mintPubkey = new PublicKey(RIDE_TOKEN_MINT);
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
  const keypair = await getTreasuryKeypair();
  if (!keypair) throw new Error('Treasury not configured');
  if (!RIDE_TOKEN_MINT) throw new Error('RIDE_TOKEN_MINT not set');
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    throw new Error('Invalid transfer amount');
  }

  const { PublicKey, Transaction } = await getWeb3();
  const { getOrCreateAssociatedTokenAccount, createTransferInstruction, getAccount } = await getSplToken();
  const connection = await getConnection();
  const mintPubkey = new PublicKey(RIDE_TOKEN_MINT);
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

  const sig = await connection.sendTransaction(tx, [keypair]);
  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
}

async function getTokenBalance(walletAddress) {
  if (!RIDE_TOKEN_MINT) return 0;
  try {
    const { PublicKey } = await getWeb3();
    const { getAssociatedTokenAddress, getAccount } = await getSplToken();
    const connection = await getConnection();
    const pubkey = new PublicKey(walletAddress);
    const mintPubkey = new PublicKey(RIDE_TOKEN_MINT);
    // Read-only lookup: compute the associated token address without creating
    // it. Creating an ATA costs the treasury SOL rent, and this function is
    // reachable (via /wallet-balance and /sync-balance) for arbitrary
    // addresses an authenticated wallet chooses to query — it should never
    // spend treasury funds just to answer a balance check.
    const ataAddress = await getAssociatedTokenAddress(mintPubkey, pubkey);
    const account = await getAccount(connection, ataAddress);
    return Number(account.amount) / 1_000_000_000;
  } catch (e) {
    // No token account yet for this address — balance is simply 0.
    return 0;
  }
}

async function getSolBalance(walletAddress) {
  try {
    const { PublicKey } = await getWeb3();
    const connection = await getConnection();
    const pubkey = new PublicKey(walletAddress);
    const lamports = await connection.getBalance(pubkey);
    return lamports / 1_000_000_000;
  } catch (e) {
    console.error('getSolBalance error for %s: %s', walletAddress, e.message);
    return 0;
  }
}

initTreasury();

module.exports = { transferTokens, getTokenBalance, getSolBalance };

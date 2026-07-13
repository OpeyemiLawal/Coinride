-- CoinRide Supabase Schema
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS users (
  wallet TEXT PRIMARY KEY,
  ride_balance NUMERIC DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS predictions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wallet TEXT NOT NULL REFERENCES users(wallet) ON DELETE CASCADE,
  coin TEXT NOT NULL,
  direction TEXT NOT NULL,
  target_pct NUMERIC NOT NULL,
  entry_price NUMERIC,
  exit_price NUMERIC,
  hit BOOLEAN DEFAULT NULL,
  claimed BOOLEAN DEFAULT false NOT NULL,
  reward NUMERIC DEFAULT 10000 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wallet TEXT NOT NULL REFERENCES users(wallet) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  type TEXT NOT NULL,
  reference_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Function to atomically add ride balance
CREATE OR REPLACE FUNCTION add_ride_balance(p_wallet TEXT, p_amount NUMERIC)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO users (wallet, ride_balance)
  VALUES (p_wallet, p_amount)
  ON CONFLICT (wallet)
  DO UPDATE SET ride_balance = users.ride_balance + p_amount;
END;
$$;

-- Ticker cooldowns: track when a user last predicted each coin (per-wallet, 5min cooldown)
CREATE TABLE IF NOT EXISTS ticker_cooldowns (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wallet TEXT NOT NULL REFERENCES users(wallet) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(wallet, ticker)
);

-- Asset cooldowns: track when an asset was last used on a ticker (replaces used_assets)
CREATE TABLE IF NOT EXISTS asset_cooldowns (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wallet TEXT NOT NULL REFERENCES users(wallet) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(wallet, asset_id, ticker)
);

-- Drop old combined cooldown table
DROP TABLE IF EXISTS used_assets CASCADE;

ALTER TABLE users ADD COLUMN IF NOT EXISTS unlocked_assets TEXT[] DEFAULT '{}';

-- Table to track ride rewards before on-chain airdrop
CREATE TABLE IF NOT EXISTS ride_rewards (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wallet TEXT NOT NULL REFERENCES users(wallet) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  asset_id TEXT NOT NULL DEFAULT 'scooter',
  reward NUMERIC NOT NULL,
  claimed BOOLEAN DEFAULT false NOT NULL,
  duration_seconds NUMERIC DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ride_rewards_wallet ON ride_rewards(wallet);
CREATE INDEX IF NOT EXISTS idx_ride_rewards_created ON ride_rewards(created_at DESC);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_predictions_wallet ON predictions(wallet);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet);
CREATE INDEX IF NOT EXISTS idx_predictions_created ON predictions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticker_cooldowns_wallet ON ticker_cooldowns(wallet);
CREATE INDEX IF NOT EXISTS idx_asset_cooldowns_wallet ON asset_cooldowns(wallet);

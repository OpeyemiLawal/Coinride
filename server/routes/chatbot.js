const express = require('express');

const router = express.Router();
const MAX_MESSAGE_LENGTH = 500;
const DAILY_REQUEST_LIMIT = Number(process.env.OPENAI_DAILY_LIMIT || 300);
let dailyUsage = { date: '', count: 0 };

const BLOCKED_PATTERNS = [
  /write (a|an|me) (poem|essay|story|code|script|song)/i,
  /\b(recipe|homework|essay|translate this|solve this equation)\b/i,
  /\b(python|javascript|html|css) code\b/i,
];

const KNOWLEDGE_BASE = `
What is CoinRide?
CoinRide is a gamified prediction market where real crypto and stock charts become playable hill-climb tracks. Players search for a coin, predict pump or dump, then ride chart-generated terrain using tiered assets.

How do rewards work?
A successful prediction over a 12-hour window earns 10,000 RIDE. Reward tiers unlock multipliers up to 100x RIDE. The first two tiers, 1x and 5x, are open to everyone. Higher tiers unlock based on RIDE held in the wallet.

What is RIDE?
RIDE is CoinRide's native token, live on Solana via Pump.fun.

What makes CoinRide different?
CoinRide combines a coin and stock aggregator, prediction market, and gameplay by turning real chart data into a playable hill-climb game.

How does gameplay work?
Search for a coin, predict its next move, then ride the chart-generated terrain with tiered assets to compete on the leaderboard.

What is the tiered asset system?
Tiered assets are vehicles and upgrades used to ride chart terrain. Higher tiers give better performance and connect to the RIDE reward tier system.

Is there a leaderboard?
Yes. Players compete by making successful predictions and riding generated terrain.

How is the token supply protected?
90% of the dev wallet supply is locked, with 1% vesting weekly into the rewards pool and ongoing CoinRide development.

Does CoinRide support stocks?
CoinRide covers real crypto charts and is designed to extend to stock charts.

How do I get started?
Search a coin, choose pump or dump, and ride the terrain to begin earning RIDE.

Is CoinRide gambling?
CoinRide is a gamified prediction market built around real chart movement and a skill-based hill-climb game.`;

const SYSTEM_PROMPT = `You are CoinRide AI, the official assistant for CoinRide. CoinRide is a gamified prediction market where crypto and stock charts become playable hill-climb games. Players predict pump or dump, ride chart-generated terrain, and earn RIDE on Solana.

Answer from the official knowledge base below whenever it applies. Do not invent CoinRide facts, token details, prices, partnerships, timelines, or guarantees. You may answer general, publicly known questions about crypto, stocks, markets, Solana, and Pump.fun when they are relevant to using CoinRide. Do not provide personalized financial advice, price predictions, or trading recommendations.

If the question is unrelated to CoinRide or general crypto, stock, or market context, reply with exactly: Sorry, I cannot help with that. Thank you!

Use plain text only. Do not use Markdown, HTML, or links.

Official CoinRide knowledge base:
${KNOWLEDGE_BASE}`;

function consumeDailyRequest() {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyUsage.date !== today) dailyUsage = { date: today, count: 0 };
  if (dailyUsage.count >= DAILY_REQUEST_LIMIT) return false;
  dailyUsage.count += 1;
  return true;
}

router.post('/chat', async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'Enter a message to start chatting.' });
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Please keep messages under ${MAX_MESSAGE_LENGTH} characters.` });
  }
  if (BLOCKED_PATTERNS.some(pattern => pattern.test(message))) {
    return res.json({ reply: 'Sorry, I cannot help with that. Thank you!' });
  }

  const apiKey = process.env.OPENAI_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'CoinRide AI is not configured yet.' });
  }
  if (!consumeDailyRequest()) {
    return res.status(429).json({ error: 'CoinRide AI has reached its daily question limit. Please try again tomorrow.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message },
        ],
        max_tokens: 200,
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('CoinRide AI request failed:', response.status, data.error?.message || 'Unknown OpenAI error');
      const error = response.status === 429
        ? 'CoinRide AI is busy. Please try again shortly.'
        : 'CoinRide AI could not answer right now. Please try again.';
      return res.status(response.status === 429 ? 429 : 502).json({ error });
    }

    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) return res.status(502).json({ error: 'CoinRide AI returned an empty response.' });
    return res.json({ reply });
  } catch (error) {
    const message = error.name === 'AbortError'
      ? 'CoinRide AI took too long to respond. Please try again.'
      : 'CoinRide AI could not be reached. Please try again.';
    console.error('CoinRide AI connection error:', error.message);
    return res.status(502).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
});

module.exports = router;

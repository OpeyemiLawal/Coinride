const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('ride_rewards')
      .select('*')
      .gte('created_at', cutoff);

    if (error) return res.status(500).json({ error: error.message });

    const agg = {};
    for (const r of data || []) {
      if (!agg[r.wallet]) agg[r.wallet] = { totalReward: 0, totalDuration: 0 };
      agg[r.wallet].totalReward += Number(r.reward);
      agg[r.wallet].totalDuration += Number(r.duration_seconds != null ? r.duration_seconds : 0);
    }

    const leaderboard = Object.entries(agg)
      .map(([wallet, v]) => ({
        wallet,
        total: Math.round(v.totalReward * 100) / 100,
        totalDuration: Math.round(v.totalDuration),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);

    res.json(leaderboard);
  } catch (err) {
    console.error('Failed to fetch leaderboard:', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

module.exports = router;

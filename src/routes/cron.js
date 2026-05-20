const express = require('express');
const { processQueue } = require('../worker/worker');

const router = express.Router();

async function handleCron(req, res) {
  const startedAt = Date.now();

  try {
    const stats = await processQueue();
    const elapsed = Date.now() - startedAt;

    return res.status(200).json({
      ok: true,
      elapsed_ms: elapsed,
      ...stats,
    });
  } catch (err) {
    console.error('[CRON] Worker run failed:', err.message, err.stack);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
}

router.post('/cron', handleCron);
router.get('/cron', handleCron);

module.exports = router;

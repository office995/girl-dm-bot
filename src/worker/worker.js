const {
  fetchDueRows,
  claimRow,
} = require('../db/queue');
const { sendMessage, addTag } = require('../services/manychat');
const { callOpenAI } = require('../ai/replies');
const {
  MAX_REPLIES_PER_CONTACT,
  HARDCODED_CLOSE_MESSAGE,
} = require('../config/env');

let isRunning = false;

async function processQueue() {
  if (isRunning) {
    console.log('[WORKER] Skipping run, previous run still in progress');
    return { skipped: true };
  }

  isRunning = true;
  const startedAt = Date.now();
  const stats = { fetched: 0, sent: 0, skipped: 0, failed: 0 };

  try {
    const rows = await fetchDueRows(25);
    stats.fetched = rows.length;

    if (rows.length === 0) {
      return stats;
    }

    console.log('[WORKER] Found', rows.length, 'due rows');

    for (const row of rows) {
      const claimed = await claimRow(row.id);
      if (!claimed) {
        stats.skipped++;
        continue;
      }

      try {
        await handleRow(row);
        stats.sent++;
      } catch (err) {
        console.error('[WORKER] handleRow failed for', row.id, err.message);
        stats.failed++;
      }
    }

    return stats;
  } finally {
    isRunning = false;
    const elapsed = Date.now() - startedAt;
    console.log('[WORKER] Run finished in', elapsed, 'ms', stats);
  }
}

async function handleRow(row) {
  const {
    contact_id: contactId,
    manychat_contact_id: manychatContactId,
    message,
    reply_number: replyNumber,
  } = row;

  console.log('[WORKER] Handling row', { id: row.id, contactId, replyNumber, msg: message.slice(0, 60) });

  let replyText;
  let isClosing = false;

  if (replyNumber >= MAX_REPLIES_PER_CONTACT) {
    replyText = HARDCODED_CLOSE_MESSAGE;
    isClosing = true;
  } else {
    const messagesForClaude = [{ role: 'user', content: message }];
    const convoMeta = { message_count: replyNumber, has_sent_link: false };

    try {
      replyText = await callOpenAI(messagesForClaude, convoMeta, '');
    } catch (err) {
      console.error('[WORKER] Claude call failed:', err.message);
      replyText = replyNumber === 1 ? "hey what's up" : "lol";
    }

    if (!replyText || !replyText.trim()) {
      replyText = replyNumber === 1 ? "hey what's up" : "lol";
    }
  }

  const sendResult = await sendMessage(manychatContactId, replyText);
  if (!sendResult.ok) {
    console.error('[WORKER] ManyChat send failed for', contactId, sendResult);
    return;
  }

  console.log('[WORKER] Sent reply #' + replyNumber + ' to', contactId);

  if (isClosing) {
    const tagResult = await addTag(manychatContactId);
    if (!tagResult.ok) {
      console.error('[WORKER] Failed to add end tag for', contactId, tagResult);
    } else {
      console.log('[WORKER] Added end tag for', contactId);
    }
  }
}

module.exports = {
  processQueue,
};

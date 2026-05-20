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

  const isFinalMessage = replyNumber >= MAX_REPLIES_PER_CONTACT;

  // Build the messages array. For msg 3 (final), we pass message_count
  // so the prompt knows this is the close and should end with "see u there".
  const messagesForClaude = [{ role: 'user', content: message }];
  const convoMeta = {
    message_count: replyNumber,
    has_sent_link: false,
    is_final_message: isFinalMessage,
  };

  let replyText;

  try {
    replyText = await callOpenAI(messagesForClaude, convoMeta, '');
  } catch (err) {
    console.error('[WORKER] Claude call failed:', err.message);
    replyText = null;
  }

  // Safety net: if Claude failed or returned empty, fall back per message number
  if (!replyText || !replyText.trim()) {
    if (isFinalMessage) {
      replyText = HARDCODED_CLOSE_MESSAGE;
    } else {
      replyText = replyNumber === 1 ? "hey whats up" : "lol";
    }
  }

  // For msg 3: if Claude didn't include "see u there", append the hardcoded
  // close as a safety net to make sure the conversation actually ends.
  if (isFinalMessage && !replyText.toLowerCase().includes('see u there')) {
    console.warn('[WORKER] Msg 3 from Claude missing "see u there", using hardcoded close instead');
    replyText = HARDCODED_CLOSE_MESSAGE;
  }

  // Send via ManyChat
  const sendResult = await sendMessage(manychatContactId, replyText);
  if (!sendResult.ok) {
    console.error('[WORKER] ManyChat send failed for', contactId, sendResult);
    return;
  }

  console.log('[WORKER] Sent reply #' + replyNumber + ' to', contactId);

  // Add end tag if this was the final message
  // (either Claude wrote "see u there" or we used the hardcoded fallback)
  if (isFinalMessage) {
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

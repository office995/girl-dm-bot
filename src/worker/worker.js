const {
  fetchDueRows,
  claimRow,
} = require('../db/queue');
const { sendMessage, addTag } = require('../services/manychat');
const { callOpenAI } = require('../ai/replies');
const {
  MAX_REPLIES_PER_CONTACT,
} = require('../config/env');

let isRunning = false;

// 18 closer variants for msg 3. Worker picks one at random and appends to Claude's
// short reaction. Each one MUST end with "see u there" (last 3 words).
const MSG3_CLOSERS = [
  'but insta is honestly horrible lol i get like 100 dms here, come find me on my bio, see u there',
  'insta is so messy w all the dms tho, lets chat where its just us, link in my bio, see u there',
  'but i cant rly chat on here, way too many dms, find me on my page, see u there',
  'insta gets so cluttered tho, find me somewhere private, link in my bio, see u there',
  'but insta is the worst for real chats, come find me on my bio, see u there',
  'honestly insta is a mess rn, lets talk somewhere else, link in my bio, see u there',
  'but i cant rly focus on here w so many dms 🙈 find me on my page, see u there',
  'insta keeps blocking my msgs too 😩 come find me where its chill, link in my bio, see u there',
  'but lets be real insta sucks for this, come find me somewhere private, link in my bio, see u there',
  'insta is so overwhelming tho, lets chat somewhere quieter, link in my bio, see u there',
  'but i barely check insta dms honestly, find me on my page, link in my bio, see u there',
  'insta is too messy for real talks lol, come find me on my bio, see u there',
  'but insta has too many eyes 👀 lets go somewhere private, link in my bio, see u there',
  'honestly i hate texting on insta lol, come find me where we can actually chat, link in my bio, see u there',
  'but my dms are a nightmare here tbh, find me on my page, link in my bio, see u there',
  'insta is so chaotic w all the dms tho, lets chat where its just us, link in my bio, see u there',
  'but i wanna talk where its just us 🙈 link in my bio, see u there',
  'insta is rly not the vibe for this, come find me somewhere private, link in my bio, see u there',
];

function pickRandomCloser() {
  return MSG3_CLOSERS[Math.floor(Math.random() * MSG3_CLOSERS.length)];
}

// Smart join: if Claude's reaction ends in an emoji, use a space.
// If it ends in a word/punctuation, use a comma + space.
function joinReactionAndCloser(reaction, closer) {
  const trimmed = reaction.trim();
  if (!trimmed) return closer;

  // Check if last "character" is an emoji (rough heuristic: non-letter, non-space, non-punctuation)
  const lastChar = trimmed.slice(-2); // grab 2 chars to handle multi-byte emojis
  const endsInEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(lastChar);
  const endsInPunct = /[.,!?]$/.test(trimmed);

  if (endsInEmoji) {
    return `${trimmed} ${closer}`;
  }
  if (endsInPunct) {
    return `${trimmed} ${closer}`;
  }
  return `${trimmed}, ${closer}`;
}

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

  // Claude generates a short reaction for ALL messages including msg 3.
  // For msg 3, the prompt instructs Claude to keep it short (2-8 words, reaction only).
  const messagesForClaude = [{ role: 'user', content: message }];
  const convoMeta = {
    message_count: replyNumber,
    has_sent_link: false,
    is_final_message: isFinalMessage,
  };

  let reactionText;

  try {
    reactionText = await callOpenAI(messagesForClaude, convoMeta, '');
  } catch (err) {
    console.error('[WORKER] Claude call failed:', err.message);
    reactionText = null;
  }

  if (!reactionText || !reactionText.trim()) {
    console.error('[WORKER] Claude returned empty for', contactId, '- using minimal fallback');
    reactionText = isFinalMessage ? 'mmm' : (replyNumber === 1 ? 'hi' : 'lol');
  }

  // For msg 3: clean up Claude's reaction and append a random closer.
  // The closers guarantee the "insta is messy + bio + see u there" funnel.
  let finalReplyText;
  if (isFinalMessage) {
    // Strip any "see u there" Claude might have included to avoid double-appending
    let cleanReaction = reactionText
      .replace(/see u there/gi, '')
      .replace(/link in (my )?bio/gi, '')
      .trim();

    // Trim trailing punctuation/commas after cleanup
    cleanReaction = cleanReaction.replace(/[,.!?\s]+$/, '').trim();

    const closer = pickRandomCloser();
    finalReplyText = joinReactionAndCloser(cleanReaction, closer);

    console.log('[WORKER] Msg 3 assembled:', { reaction: cleanReaction, closer: closer.slice(0, 50) + '...' });
  } else {
    finalReplyText = reactionText.trim();
  }

  // Send via ManyChat
  const sendResult = await sendMessage(manychatContactId, finalReplyText);
  if (!sendResult.ok) {
    console.error('[WORKER] ManyChat send failed for', contactId, sendResult);
    return;
  }

  console.log('[WORKER] Sent reply #' + replyNumber + ' to', contactId);

  // Add end tag if this was the final message
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

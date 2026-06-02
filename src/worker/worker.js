const {
  fetchDueRows,
  claimRow,
  enqueueMessage,
} = require('../db/queue');
const { sendMessage, addTag } = require('../services/manychat');
const { callOpenAI } = require('../ai/replies');
const {
  isUnder18Message,
  UNDER_18_REPLY,
  isBotProbeMessage,
  pickRandomBotDeflection,
} = require('../lib/safety');
const {
  MAX_REPLIES_PER_CONTACT,
} = require('../config/env');
const { supabase } = require('../db/supabase');

let isRunning = false;

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

function joinReactionAndCloser(reaction, closer) {
  const trimmed = reaction.trim();
  if (!trimmed) return closer;

  const lastChar = trimmed.slice(-2);
  const endsInEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(lastChar);
  const endsInPunct = /[.,!?]$/.test(trimmed);

  if (endsInEmoji || endsInPunct) {
    return `${trimmed} ${closer}`;
  }
  return `${trimmed}, ${closer}`;
}

async function maxOutContact(contactId, manychatContactId) {
  if (!supabase) return;

  const nowIso = new Date().toISOString();
  const fillerRows = [];
  for (let i = 0; i < MAX_REPLIES_PER_CONTACT; i++) {
    fillerRows.push({
      contact_id: contactId,
      manychat_contact_id: manychatContactId,
      message: '[safety_block]',
      reply_number: 99,
      scheduled_at: nowIso,
      processed: true,
    });
  }

  const { error } = await supabase.from('message_queue').insert(fillerRows);
  if (error) {
    console.error('[SAFETY] Failed to insert filler rows for', contactId, error.message);
  } else {
    console.log('[SAFETY] Maxed out contact', contactId);
  }
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

  // ====== SAFETY LAYER 1: Under-18 pre-screen ======
  if (isUnder18Message(message)) {
    console.warn('[SAFETY] Under-18 pattern detected for', contactId, '- hard ending');

    const sendResult = await sendMessage(manychatContactId, UNDER_18_REPLY);
    if (!sendResult.ok) {
      console.error('[SAFETY] Failed to send under-18 refusal to', contactId, sendResult);
    } else {
      console.log('[SAFETY] Sent under-18 refusal to', contactId);
    }

    const tagResult = await addTag(manychatContactId);
    if (!tagResult.ok) {
      console.error('[SAFETY] Failed to add end tag for', contactId, tagResult);
    } else {
      console.log('[SAFETY] Added end tag for', contactId);
    }

    await maxOutContact(contactId, manychatContactId);
    return;
  }

  // ====== SAFETY LAYER 2: Bot/AI probe pre-screen ======
  // Catches "are you a bot", "managed by agency", "who built you" etc.
  // Sends a deflection from the pool. Does NOT call Claude.
  if (isBotProbeMessage(message)) {
    console.warn('[SAFETY] Bot-probe pattern detected for', contactId, '- sending deflection');

    const deflection = pickRandomBotDeflection();
    const sendResult = await sendMessage(manychatContactId, deflection);
    if (!sendResult.ok) {
      console.error('[SAFETY] Failed to send bot-deflection to', contactId, sendResult);
      return;
    }
    console.log('[SAFETY] Sent bot-deflection to', contactId, ':', deflection);

    // If this was the final message, still close the convo
    if (replyNumber >= MAX_REPLIES_PER_CONTACT) {
      const tagResult = await addTag(manychatContactId);
      if (tagResult.ok) {
        console.log('[SAFETY] Added end tag for', contactId, '(probe on final msg)');
      }
    }
    return;
  }

  const isFinalMessage = replyNumber >= MAX_REPLIES_PER_CONTACT;

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

  let finalReplyText;
  if (isFinalMessage) {
    let cleanReaction = reactionText
      .replace(/see u there/gi, '')
      .replace(/link in (my )?bio/gi, '')
      .trim();

    cleanReaction = cleanReaction.replace(/[,.!?\s]+$/, '').trim();

    const closer = pickRandomCloser();
    finalReplyText = joinReactionAndCloser(cleanReaction, closer);

    console.log('[WORKER] Msg 3 assembled:', { reaction: cleanReaction, closer: closer.slice(0, 50) + '...' });
  } else {
    finalReplyText = reactionText.trim();
  }

  const sendResult = await sendMessage(manychatContactId, finalReplyText);
  if (!sendResult.ok) {
    console.error('[WORKER] ManyChat send failed for', contactId, sendResult);
    return;
  }

  console.log('[WORKER] Sent reply #' + replyNumber + ' to', contactId);

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

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

// 10 transition lines. Each is the "why insta sucks" part of msg 3.
// Link is mentioned passively (no "click here / go here" -- that's solicitation).
const MSG3_TRANSITIONS = [
  'insta is too restrictive, im way more active on link.me/@lexafuntime',
  'insta wont let me say much here, im usually on link.me/@lexafuntime',
  'insta is so restrictive, you can find me on link.me/@lexafuntime',
  'insta blocks half my msgs, im more active on link.me/@lexafuntime',
  'insta is too restrictive for me, im here way more link.me/@lexafuntime',
  'insta doesnt let me do much here, im more active on link.me/@lexafuntime',
  'insta restricts everything, you can find me on link.me/@lexafuntime',
  'insta wont let me chat freely, im usually on link.me/@lexafuntime',
  'insta is wayy too restrictive, im here daily link.me/@lexafuntime',
  'insta doesnt let me say what i want, im more active on link.me/@lexafuntime',
];

// Connectors between Claude's reaction and the transition.
// Empty string = plain comma (no connector). Used ~30% of the time for natural variance.
const MSG3_CONNECTORS = [
  'but',
  'but honestly',
  'tbh',
  'btw',
  'but lowkey',
  'ngl',
  'but ngl',
  'anyway',
  'and honestly',
  'and tbh',
  '', // plain comma, no word connector
  '', // weighted to ~20% chance of plain comma
];

const SIGNOFF = 'see u there';

function pickRandomTransition() {
  return MSG3_TRANSITIONS[Math.floor(Math.random() * MSG3_TRANSITIONS.length)];
}

function pickRandomConnector() {
  return MSG3_CONNECTORS[Math.floor(Math.random() * MSG3_CONNECTORS.length)];
}

function assembleMsg3(reaction) {
  let cleanReaction = (reaction || '').trim().replace(/[,.!?\s]+$/, '').trim();
  const transition = pickRandomTransition();
  const connector = pickRandomConnector();

  // Detect if reaction ends in emoji
  const lastTwo = cleanReaction.slice(-2);
  const endsInEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(lastTwo);

  let body;
  if (!cleanReaction) {
    // Edge case: no reaction at all -- start with the transition
    body = transition;
  } else if (connector) {
    // With connector: emoji → space + connector + transition;  word → comma + connector + transition
    body = endsInEmoji
      ? `${cleanReaction} ${connector} ${transition}`
      : `${cleanReaction}, ${connector} ${transition}`;
  } else {
    // No connector: emoji → space + transition;  word → comma + transition
    body = endsInEmoji
      ? `${cleanReaction} ${transition}`
      : `${cleanReaction}, ${transition}`;
  }

  return `${body}, ${SIGNOFF}`;
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
  if (isBotProbeMessage(message)) {
    console.warn('[SAFETY] Bot-probe pattern detected for', contactId, '- sending deflection');

    const deflection = pickRandomBotDeflection();
    const sendResult = await sendMessage(manychatContactId, deflection);
    if (!sendResult.ok) {
      console.error('[SAFETY] Failed to send bot-deflection to', contactId, sendResult);
      return;
    }
    console.log('[SAFETY] Sent bot-deflection to', contactId, ':', deflection);

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
    // Strip anything Claude might have added that we don't want doubled
    let cleanReaction = reactionText
      .replace(/see u there/gi, '')
      .replace(/link in (my )?bio/gi, '')
      .replace(/link\.me\/@?lexafuntime/gi, '')
      .replace(/https?:\/\/\S+/gi, '')
      .trim();

    cleanReaction = cleanReaction.replace(/[,.!?\s]+$/, '').trim();

    finalReplyText = assembleMsg3(cleanReaction);

    console.log('[WORKER] Msg 3 assembled:', { reaction: cleanReaction, full: finalReplyText.slice(0, 100) });
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

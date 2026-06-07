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

// 20 closer variants. Theme: too many dms here / barely use insta / im active on link.
// Each contains the raw URL link.me/@lexafuntime (no https://).
// Each MUST end with "talk soon luv" -- that's the trigger phrase that tells the
// worker to add the end tag and close the conversation.
// NO emojis anywhere in these (msg 3 is emoji-free for safety/cleanliness).
const MSG3_CLOSERS = [
  'but i have way too many dms here, im mostly active on link.me/@lexafuntime, talk soon luv',
  'but my dms are insane here, im way more active on link.me/@lexafuntime, talk soon luv',
  'but i barely check insta dms, im usually on link.me/@lexafuntime, talk soon luv',
  'but i get like 100 dms a day here, im mostly on link.me/@lexafuntime, talk soon luv',
  'but insta dms are crazy, im more active on link.me/@lexafuntime, talk soon luv',
  'but ngl i never check insta dms, im on link.me/@lexafuntime, talk soon luv',
  'but my insta is a mess, im way more on link.me/@lexafuntime, talk soon luv',
  'but cant rly chat here, im usually on link.me/@lexafuntime, talk soon luv',
  'but i miss messages here all the time, im mostly on link.me/@lexafuntime, talk soon luv',
  'but tbh i barely use insta, im usually on link.me/@lexafuntime, talk soon luv',
  'but my dms here are wild, im way more active on link.me/@lexafuntime, talk soon luv',
  'but i lose track of msgs here, im mostly on link.me/@lexafuntime, talk soon luv',
  'but insta is too chaotic for me, im usually on link.me/@lexafuntime, talk soon luv',
  'but i forget to check dms here lol, im more on link.me/@lexafuntime, talk soon luv',
  'but my dms here are a mess tbh, im usually on link.me/@lexafuntime, talk soon luv',
  'but i rly dont use insta much, im mostly on link.me/@lexafuntime, talk soon luv',
  'but my dms get buried here, im more active on link.me/@lexafuntime, talk soon luv',
  'but i hardly reply on insta, im usually on link.me/@lexafuntime, talk soon luv',
  'but cant keep up with insta dms, im mostly on link.me/@lexafuntime, talk soon luv',
  'but my insta dms are a nightmare, im way more on link.me/@lexafuntime, talk soon luv',
];

const SIGNOFF_PHRASE = 'talk soon luv';

function pickRandomCloser() {
  return MSG3_CLOSERS[Math.floor(Math.random() * MSG3_CLOSERS.length)];
}

// Strip emojis from a string. Used to clean Claude's msg 3 reaction so msg 3
// stays emoji-free.
function stripEmojis(text) {
  return (text || '')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{1F000}-\u{1F02F}]/gu, '')
    .replace(/[\u{1F100}-\u{1F1FF}]/gu, '')
    .replace(/[\u{1F200}-\u{1F2FF}]/gu, '')
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
    .replace(/\uFE0F/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Join reaction + closer. Since msg 3 has NO emojis at all, we just use comma+space
// if reaction ends in a word, or just space if it ends in punctuation.
function joinReactionAndCloser(reaction, closer) {
  const trimmed = reaction.trim();
  if (!trimmed) return closer;

  const endsInPunct = /[.,!?]$/.test(trimmed);

  if (endsInPunct) {
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
    // Strip anything Claude might have added that we'll re-append from the closer pool
    let cleanReaction = reactionText
      .replace(/talk soon luv/gi, '')
      .replace(/see u there/gi, '')
      .replace(/link in (my )?bio/gi, '')
      .replace(/link\.me\/@?\w+/gi, '')
      .replace(/https?:\/\/\S+/gi, '')
      .trim();

    // Strip ALL emojis (msg 3 is emoji-free)
    cleanReaction = stripEmojis(cleanReaction);

    // Trim trailing punctuation/whitespace
    cleanReaction = cleanReaction.replace(/[,.!?\s]+$/, '').trim();

    const closer = pickRandomCloser();
    finalReplyText = joinReactionAndCloser(cleanReaction, closer);

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

  // Detect "talk soon luv" in the sent message -> add end tag.
  // This mirrors the original "see u there" detection pattern.
  if (finalReplyText.toLowerCase().includes(SIGNOFF_PHRASE)) {
    const tagResult = await addTag(manychatContactId);
    if (!tagResult.ok) {
      console.error('[WORKER] Failed to add end tag for', contactId, tagResult);
    } else {
      console.log('[WORKER] Added end tag for', contactId, '(detected "' + SIGNOFF_PHRASE + '")');
    }
  }
}

module.exports = {
  processQueue,
};

const express = require('express');
const { requireSecret } = require('../middleware/auth');
const {
  getPendingForContact,
  countProcessedForContact,
  enqueueMessage,
} = require('../db/queue');
const {
  REPLY_DELAY_MS,
  MAX_REPLIES_PER_CONTACT,
} = require('../config/env');
const { sanitize } = require('../lib/utils');

const router = express.Router();

function silentResponse() {
  return {
    reply: '[silent]',
    version: 'v2',
    content: { messages: [] },
  };
}

router.post('/webhook', requireSecret, async (req, res) => {
  try {
    const {
      contact_id,
      subscriber_id,
      last_input_text,
      latest_message,
    } = req.body || {};

    const incomingMessage = last_input_text || latest_message || '';
    const contactIdRaw = contact_id || subscriber_id || '';
    const manychatContactIdRaw = subscriber_id || contact_id || '';

    if (!contactIdRaw || !incomingMessage) {
      console.warn('[WEBHOOK] Missing contact_id or message', { body: req.body });
      return res.status(400).json({
        error: 'contact_id and message (last_input_text/latest_message) are required',
      });
    }

    const contactId = sanitize(String(contactIdRaw));
    const manychatContactId = sanitize(String(manychatContactIdRaw));
    const message = sanitize(String(incomingMessage));

    console.log('[WEBHOOK] Received', { contactId, msg: message.slice(0, 80) });

    const pending = await getPendingForContact(contactId);
    if (pending) {
      console.log('[WEBHOOK] Timer already running for', contactId, '- ignoring');
      return res.status(200).json(silentResponse());
    }

    const processedCount = await countProcessedForContact(contactId);
    const replyNumber = processedCount + 1;

    if (replyNumber > MAX_REPLIES_PER_CONTACT) {
      console.log('[WEBHOOK] Contact', contactId, 'has hit max replies, ghosting');
      return res.status(200).json(silentResponse());
    }

    const scheduledAt = new Date(Date.now() + REPLY_DELAY_MS).toISOString();

    const row = await enqueueMessage({
      contactId,
      manychatContactId,
      message,
      replyNumber,
      scheduledAt,
    });

    if (!row) {
      console.error('[WEBHOOK] Failed to enqueue for', contactId);
      return res.status(200).json(silentResponse());
    }

    console.log('[WEBHOOK] Queued reply', {
      contactId,
      replyNumber,
      scheduledAt,
      rowId: row.id,
    });

    return res.status(200).json(silentResponse());
  } catch (err) {
    console.error('[WEBHOOK ERROR]', err.message, err.stack);
    return res.status(200).json(silentResponse());
  }
});

module.exports = router;

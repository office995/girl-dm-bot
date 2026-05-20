const { MANYCHAT_API_KEY, END_TAG_NAME } = require('../config/env');

const BASE_URL = 'https://api.manychat.com';

async function sendMessage(manychatContactId, text) {
  if (!MANYCHAT_API_KEY) {
    console.error('[MANYCHAT] MANYCHAT_API_KEY is not set, cannot send');
    return { ok: false, error: 'no_api_key' };
  }

  if (!manychatContactId) {
    console.error('[MANYCHAT] sendMessage called with empty contact id');
    return { ok: false, error: 'no_contact_id' };
  }

  // Instagram-channel ManyChat payload.
  // Removed `message_tag` (a Messenger-only concept).
  // Subscriber ID stays as the {{contact.id}} value from the webhook body.
  const body = {
    subscriber_id: manychatContactId,
    data: {
      version: 'v2',
      content: {
        messages: [
          { type: 'text', text },
        ],
      },
    },
  };

  console.log('[MANYCHAT] sendMessage payload:', JSON.stringify(body));

  try {
    const resp = await fetch(`${BASE_URL}/fb/sending/sendContent`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MANYCHAT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const rawText = await resp.text();
    let json = {};
    try { json = JSON.parse(rawText); } catch (_) { json = { raw: rawText }; }

    console.log('[MANYCHAT] sendMessage response status:', resp.status);
    console.log('[MANYCHAT] sendMessage response body:', JSON.stringify(json));

    if (!resp.ok || json.status === 'error') {
      return { ok: false, error: 'api_error', status: resp.status, response: json };
    }

    return { ok: true, response: json };
  } catch (err) {
    console.error('[MANYCHAT] sendMessage exception:', err.message);
    return { ok: false, error: 'exception', message: err.message };
  }
}

async function addTag(manychatContactId, tagName = END_TAG_NAME) {
  if (!MANYCHAT_API_KEY) {
    console.error('[MANYCHAT] MANYCHAT_API_KEY is not set, cannot add tag');
    return { ok: false, error: 'no_api_key' };
  }

  const body = {
    subscriber_id: manychatContactId,
    tag_name: tagName,
  };

  console.log('[MANYCHAT] addTag payload:', JSON.stringify(body));

  try {
    const resp = await fetch(`${BASE_URL}/fb/subscriber/addTagByName`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MANYCHAT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const rawText = await resp.text();
    let json = {};
    try { json = JSON.parse(rawText); } catch (_) { json = { raw: rawText }; }

    console.log('[MANYCHAT] addTag response status:', resp.status);
    console.log('[MANYCHAT] addTag response body:', JSON.stringify(json));

    if (!resp.ok || json.status === 'error') {
      return { ok: false, error: 'api_error', status: resp.status, response: json };
    }

    return { ok: true, response: json };
  } catch (err) {
    console.error('[MANYCHAT] addTag exception:', err.message);
    return { ok: false, error: 'exception', message: err.message };
  }
}

module.exports = {
  sendMessage,
  addTag,
};

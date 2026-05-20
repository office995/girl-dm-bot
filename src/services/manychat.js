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
    message_tag: 'ACCOUNT_UPDATE',
  };

  try {
    const resp = await fetch(`${BASE_URL}/fb/sending/sendContent`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MANYCHAT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const json = await resp.json().catch(() => ({}));

    if (!resp.ok || json.status === 'error') {
      console.error('[MANYCHAT] sendMessage failed:', resp.status, json);
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

  try {
    const resp = await fetch(`${BASE_URL}/fb/subscriber/addTagByName`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MANYCHAT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const json = await resp.json().catch(() => ({}));

    if (!resp.ok || json.status === 'error') {
      console.error('[MANYCHAT] addTag failed:', resp.status, json);
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

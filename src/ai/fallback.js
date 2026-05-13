// canned replies for when the api key is missing or the api is unreachable.
// keep the voice on-brand: lowercase, direct, no fluff, no emojis.

function mockReply(messages) {
  const last = (messages[messages.length - 1]?.content || '').toLowerCase().trim();
  const turnCount = messages.filter(m => m.role === 'user').length;

  if (/\b(i'?m\s*a\s*(model|creator|influencer)|i\s*am\s*a\s*(model|creator|influencer)|i\s*do\s*content|collab|promo|management|agency|represent|help with my page)\b/i.test(last)) {
    return 'ok send your page, someone will check it\n[MODEL_LEAD]';
  }

  if (/^(hey|hi|yo|sup|what's up|wsp|👋)$/i.test(last)) {
    return 'hey you';
  }

  if (/link|website|site|where.*see|see more|private|vip|onlyfans|fansly|fanvue|of\b/i.test(last)) {
    return 'private page is here\nYOUR_MODEL_LINK_HERE';
  }

  if (/how much|price|cost|menu/i.test(last)) {
    return 'prices are on there, you can see before you join\nYOUR_MODEL_LINK_HERE';
  }

  if (/custom|customs|special request|pay|payment/i.test(last)) {
    return 'maybe, depends what you want. send it and i’ll check [ESCALATE]';
  }

  if (/free|send pic|show me|nudes|nude/i.test(last)) {
    return 'free preview is ig, the rest is private\nYOUR_MODEL_LINK_HERE';
  }

  if (/cute|hot|beautiful|fine|sexy|bad/i.test(last)) {
    return 'thank you, you’re not too bad yourself';
  }

  if (/meet|pull up|date|come over|hangout|hang out/i.test(last)) {
    return 'i don’t do meetups, babe';
  }

  if (/bot|ai|real/i.test(last)) {
    return 'i’ve got help with my dms, but yeah i see what comes through';
  }

  if (/under 18|i'm 17|i am 17|im 17|i'm 16|i am 16|im 16|minor/i.test(last)) {
    return 'you gotta be 18+ for that, so i can’t help with it';
  }

  if (turnCount <= 1) return 'what made you dm me';
  return 'say what you really came for';
}

module.exports = {
  mockReply,
};

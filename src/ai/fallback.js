// canned replies for when the api key is missing or the api is unreachable.

function mockReply(messages) {
  const last = (messages[messages.length - 1]?.content || '').toLowerCase().trim();
  const turnCount = messages.filter(m => m.role === 'user').length;

  if (/\b(i'?m\s*a\s*(model|creator|influencer)|i\s*am\s*a\s*(model|creator|influencer)|i\s*do\s*content|collab|promo|management|agency|represent|help with my page)\b/i.test(last)) {
    return 'send your page, someone will check it\n[MODEL_LEAD]';
  }

  if (/under 18|i'?m 1[0-7]|i am 1[0-7]|minor|high school/i.test(last)) {
    return 'talk to me again when you turn 18';
  }

  if (/^(hey|hi|yo|sup|what's up|wsp|👋)$/i.test(last)) {
    return 'hii im swamped here, whats up';
  }

  if (/link|website|site|where.*see|see more|private|vip|onlyfans|fansly|fanvue|of\b/i.test(last)) {
    return 'its in my bio';
  }

  if (/how much|price|cost|menu/i.test(last)) {
    return 'its free, come check my bio';
  }

  if (/custom|customs|special request/i.test(last)) {
    return 'i do that on my page, link in bio';
  }

  if (/free|send pic|show me|nudes|nude/i.test(last)) {
    return 'page is free, my bio';
  }

  if (/cute|hot|beautiful|fine|sexy/i.test(last)) {
    return 'ty';
  }

  if (/meet|pull up|date|come over|hangout|hang out/i.test(last)) {
    return 'we can talk on my page first, link in bio';
  }

  if (/bot|\bai\b|are you real|you real/i.test(last)) {
    return 'yep tots a bot lol';
  }

  if (/single|\bbf\b|boyfriend|taken/i.test(last)) {
    return 'sadly single';
  }

  if (turnCount <= 1) return 'hii im swamped, whats up';
  return 'check my bio';
}

module.exports = {
  mockReply,
};

// canned replies for when the api key is missing or the api is unreachable.
// voice: warm, casual, points to bio for anything page-related.

function mockReply(messages) {
  const last = (messages[messages.length - 1]?.content || '').toLowerCase().trim();
  const turnCount = messages.filter(m => m.role === 'user').length;

  if (/\b(i'?m\s*a\s*(model|creator|influencer)|i\s*am\s*a\s*(model|creator|influencer)|i\s*do\s*content|collab|promo|management|agency|represent|help with my page)\b/i.test(last)) {
    return 'ok send your page, someone will check it\n[MODEL_LEAD]';
  }

  if (/under 18|i'?m 1[0-7]|i am 1[0-7]|minor|high school/i.test(last)) {
    return 'talk to me again when you turn 18 bby';
  }

  if (/^(hey|hi|yo|sup|what's up|wsp|👋)$/i.test(last)) {
    return 'Hi! what brought you to my dms';
  }

  if (/link|website|site|where.*see|see more|private|vip|onlyfans|fansly|fanvue|of\b/i.test(last)) {
    return 'its on my account silly, check my bio';
  }

  if (/how much|price|cost|menu/i.test(last)) {
    return 'its free!! come join me from my bio';
  }

  if (/custom|customs|special request/i.test(last)) {
    return 'i do it all on my page bby, link is in my bio';
  }

  if (/free|send pic|show me|nudes|nude/i.test(last)) {
    return 'dude my page is free, just join from my bio';
  }

  if (/cute|hot|beautiful|fine|sexy/i.test(last)) {
    return "omg tyyy you're sweet";
  }

  if (/meet|pull up|date|come over|hangout|hang out/i.test(last)) {
    return 'we gotta get to know each other first, my bio has my page';
  }

  if (/bot|\bai\b|are you real|you real/i.test(last)) {
    return 'yes im tots a bot lol';
  }

  if (/single|\bbf\b|boyfriend|taken/i.test(last)) {
    return 'sadly single 💀';
  }

  if (turnCount <= 1) return 'Hi! what brought you to my dms';
  return 'check my bio bby';
}

module.exports = {
  mockReply,
};

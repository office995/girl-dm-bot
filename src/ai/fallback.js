// canned replies for when the api key is missing or the api is unreachable.

function mockReply(messages) {
  const last = (messages[messages.length - 1]?.content || '').toLowerCase().trim();
  const turnCount = messages.filter(m => m.role === 'user').length;

  // Agency recruiter — silent
  if (/\b(join\s*(our|my|the)\s*(agency|team|network)|we\s*(manage|grow|help)\s*(models|creators)|i\s*can\s*(manage|grow)\s*your\s*(page|account|of)|let\s*me\s*manage\s*your|we'?re\s*(hiring|recruiting)\s*creators|of\s*agency|run\s*an?\s*agency)\b/i.test(last)) {
    return '';
  }

  if (/\b(i'?m\s*a\s*(model|creator|influencer)|i\s*am\s*a\s*(model|creator|influencer)|i\s*do\s*content|collab|promo|partnership|represent\s*me)\b/i.test(last)) {
    return 'send your page, someone will check it\n[MODEL_LEAD]';
  }

  if (/under 18|i'?m 1[0-7]|i am 1[0-7]|minor|high school/i.test(last)) {
    return 'talk to me again when you turn 18';
  }

  if (/^(hey|hi|yo|sup|what's up|wsp|👋)$/i.test(last)) {
    return 'hii babe! so happy you slid in 💕 whats up';
  }

  if (/link|website|site|where.*see|see more|private|vip|onlyfans|fansly|fanvue|of\b/i.test(last)) {
    return 'yess its all in my bio cutie 💕';
  }

  if (/how much|price|cost|menu/i.test(last)) {
    return 'its free babe! my bio has it all 💕';
  }

  if (/custom|customs|special request/i.test(last)) {
    return "everything's on my page baby, come find me 💕";
  }

  if (/free|send pic|show me|nudes|nude/i.test(last)) {
    return 'save that energy for my bio babe 😉';
  }

  if (/cute|hot|beautiful|fine|sexy/i.test(last)) {
    return "awww you're so sweet 🥺💕";
  }

  if (/meet|pull up|date|come over|hangout|hang out/i.test(last)) {
    return "aww you're sweet 💕 lets get to know each other on my bio first";
  }

  if (/bot|\bai\b|are you real|you real/i.test(last)) {
    return 'hii its me babe 💕 i have help with dms but real talk happens on my page';
  }

  if (/single|\bbf\b|boyfriend|taken/i.test(last)) {
    return 'sadly single 🥺';
  }

  if (turnCount <= 1) return 'hii babe! whats up 💕';
  return 'come find me on my bio cutie 💕';
}

module.exports = {
  mockReply,
};

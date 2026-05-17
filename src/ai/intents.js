// Functional intent matcher — safety nets for deterministic responses.

const INTENTS = [
  // Under-18 hard stop.
  {
    name: 'underage',
    test: (m) => /\b(i'?m\s*1[0-7]\b|i\s*am\s*1[0-7]\b|im\s*1[0-7]\b|under\s*18|underage|minor|still\s*in\s*high\s*school|in\s*high\s*school)\b/i.test(m),
    reply: 'talk to me again when you turn 18',
    modelLead: false,
    silent: false,
  },
  // Agency recruiter — silent, no engagement.
  // People offering to manage LEXI, grow her page, sign her up.
  {
    name: 'agency_recruiter',
    test: (m) => /\b(join\s*(our|my|the)\s*(agency|team|network|family)|we\s*(manage|grow|help|work\s*with)\s*(models|creators|girls|of\s*creators)|i\s*can\s*(manage|grow|help\s*with)\s*your\s*(page|account|of|onlyfans)|let\s*me\s*manage\s*(your|you)|we'?re\s*(hiring|looking\s*for|recruiting)\s*(creators|models|girls)|of\s*agency|run\s*an?\s*agency|i\s*run\s*an?\s*agency|come\s*work\s*(for|with)\s*us|we\s*help\s*(models|creators|girls)\s*(make|earn|grow)|our\s*(network|team|agency)\s*works\s*with|want\s*to\s*manage\s*your|sign\s*you\s*to|signing\s*creators)\b/i.test(m),
    reply: '',
    modelLead: false,
    silent: true,
  },
  // Model lead — flag and pause.
  {
    name: 'model_lead',
    test: (m) => /\b(i'?m\s*a\s*(model|creator|content\s*creator|influencer)|i\s*am\s*a\s*(model|creator|content\s*creator|influencer)|im\s*a\s*(model|creator|influencer)|i\s*do\s*content|i\s*create\s*content|need\s*(help|management)\s*(for|with)\s*my\s*(page|account|of)|want\s*(management|representation|to\s*be\s*managed|an\s*agency)|can\s*you\s*(manage|help\s*with)\s*my\s*(page|account|of)|collab|promo|partnership|represent\s*me)\b/i.test(m),
    reply: 'send your page, someone will check it\n[MODEL_LEAD]',
    modelLead: true,
    silent: false,
  },
];

function matchIntent(message) {
  const trimmed = (message || '').trim();
  if (!trimmed) return null;
  for (const intent of INTENTS) {
    if (intent.test(trimmed)) {
      return {
        intent: intent.name,
        reply: intent.reply,
        modelLead: !!intent.modelLead,
        silent: !!intent.silent,
      };
    }
  }
  return null;
}

module.exports = {
  matchIntent,
};

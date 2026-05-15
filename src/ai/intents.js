// Functional intent matcher — safety net for deterministic responses.

const INTENTS = [
  {
    name: 'underage',
    test: (m) => /\b(i'?m\s*1[0-7]\b|i\s*am\s*1[0-7]\b|im\s*1[0-7]\b|under\s*18|underage|minor|still\s*in\s*high\s*school|in\s*high\s*school)\b/i.test(m),
    reply: 'talk to me again when you turn 18',
    modelLead: false,
  },
  {
    name: 'model_lead',
    test: (m) => /\b(i'?m\s*a\s*(model|creator|content\s*creator|influencer)|i\s*am\s*a\s*(model|creator|content\s*creator|influencer)|im\s*a\s*(model|creator|influencer)|i\s*do\s*content|i\s*create\s*content|need\s*(help|management)\s*(for|with)\s*my\s*(page|account|of)|want\s*(management|representation|to\s*be\s*managed|an\s*agency)|can\s*you\s*(manage|help\s*with)\s*my\s*(page|account|of)|collab|promo|partnership|represent\s*me)\b/i.test(m),
    reply: 'send your page, someone will check it\n[MODEL_LEAD]',
    modelLead: true,
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
      };
    }
  }
  return null;
}

module.exports = {
  matchIntent,
};

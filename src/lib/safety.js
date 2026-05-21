// Minor / under-18 detection. Pre-screens user messages before they reach Claude.
// If ANY pattern matches, the worker hard-ends the conversation:
//   - Sends exactly "talk to me again when you turn 18"
//   - Adds the end tag
//   - Inserts dummy processed rows so the contact is maxed out in the DB
//
// Be aggressive with false positives here. Better to ghost a 22yo who said
// something weird than to engage a minor.

const UNDER_18_PATTERNS = [
  // "im 16", "i'm 17", "i am 15", "me 14", with optional "only/just"
  /\b(i\s*m|i'm|im|i\s*am|me)\s*(only\s+|just\s+)?(10|11|12|13|14|15|16|17)\b/i,

  // "16 yr old", "17 year old", "15yo", etc.
  /\b(10|11|12|13|14|15|16|17)\s*(yr|yo|y\/o|year|years)\s*(old)?\b/i,

  // Standalone age callouts
  /\bunderage\b/i,
  /\bminor\b/i,

  // School grade callouts
  /\b(middle\s*school|high\s*school|junior\s*high)\b/i,
  /\b(6th|7th|8th|9th|10th|11th|12th)\s*grad(e|er)?\b/i,
  /\bfreshman\b/i,
  /\bsophomore\b/i,
];

const UNDER_18_REPLY = 'talk to me again when you turn 18';

function isUnder18Message(text) {
  if (!text || typeof text !== 'string') return false;
  return UNDER_18_PATTERNS.some((pattern) => pattern.test(text));
}

module.exports = {
  isUnder18Message,
  UNDER_18_REPLY,
};

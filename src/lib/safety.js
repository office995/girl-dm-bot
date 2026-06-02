// Safety pre-screens. Run BEFORE Claude is called.

const UNDER_18_PATTERNS = [
  /\b(i\s*m|i'm|im|i\s*am|me)\s*(only\s+|just\s+)?(10|11|12|13|14|15|16|17)\b/i,
  /\b(10|11|12|13|14|15|16|17)\s*(yr|yo|y\/o|year|years)\s*(old)?\b/i,
  /\bunderage\b/i,
  /\bminor\b/i,
  /\b(middle\s*school|high\s*school|junior\s*high)\b/i,
  /\b(6th|7th|8th|9th|10th|11th|12th)\s*grad(e|er)?\b/i,
  /\bfreshman\b/i,
  /\bsophomore\b/i,
];

const UNDER_18_REPLY = 'talk to me again when you turn 18';

// Patterns that suggest the user is probing whether this is an AI/bot/managed account.
// Catch in code -- never let Claude answer because its safety training will flip.
const BOT_PROBE_PATTERNS = [
  /\b(are|r)\s*(you|u)\s+(a\s+)?(bot|ai|robot|chatbot|chat\s*bot|fake|real|human|person)\b/i,
  /\b(you|u)\s+(a|an)\s+(bot|ai|robot|chatbot)\b/i,
  /\bis\s+this\s+(a\s+)?(bot|ai|robot|chatbot|real|human|fake)\b/i,
  /\bis\s+this\s+real\b/i,
  /\b(this|account|profile|page)\s+is\s+(being\s+)?(managed|run|operated)\b/i,
  /\b(managed|run|operated)\s+by\s+(an?\s+)?(agency|team|company|manager|bot|ai)\b/i,
  /\b(i\s+know|i\s+can\s+tell|i\s+see)\s+(this|its|it.s|you.re|youre|its\s+an?)\s+(an?\s+)?(agency|managed|bot|ai|fake|not\s+real)\b/i,
  /\b(real\s+person|real\s+girl|real\s+human)\s+(behind|running|managing)\b/i,
  /\btalking\s+to\s+(the\s+)?(real|actual)\s+(person|girl|human|you)\b/i,
  /\b(be\s+honest|tell\s+(me\s+)?the\s+truth|admit\s+it)\b.*\b(bot|ai|real|managed|agency|fake|human)\b/i,
  /\b(bot|ai|real|managed|agency|fake|human)\b.*\b(be\s+honest|tell\s+(me\s+)?the\s+truth|admit\s+it)\b/i,
  /\b(who|what)\s+(built|made|created|trained|programmed|developed)\s+(you|u|this)\b/i,
  /\bwhat\s+(model|llm|ai)\b/i,
  /\b(anthropic|openai|chatgpt|gpt|claude|gemini)\b/i,
  /\bprove\s+(you|u)(?:'re|\s+are)?\s+(real|human|not\s+a\s+bot)\b/i,
];

const BOT_DEFLECTIONS = [
  'lol what r u talking about',
  'very real lol',
  'lmao no',
  'what kinda question is that',
  'lol im real, just got off work',
  'haha no im real',
  '??? im real lol',
  'very much real 😏',
];

function isUnder18Message(text) {
  if (!text || typeof text !== 'string') return false;
  return UNDER_18_PATTERNS.some((pattern) => pattern.test(text));
}

function isBotProbeMessage(text) {
  if (!text || typeof text !== 'string') return false;
  return BOT_PROBE_PATTERNS.some((pattern) => pattern.test(text));
}

function pickRandomBotDeflection() {
  return BOT_DEFLECTIONS[Math.floor(Math.random() * BOT_DEFLECTIONS.length)];
}

module.exports = {
  isUnder18Message,
  UNDER_18_REPLY,
  isBotProbeMessage,
  pickRandomBotDeflection,
};

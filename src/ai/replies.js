const { SYSTEM_PROMPT } = require('./prompts');
const { callClaudeRaw } = require('./anthropic');
const {
  humanizeReply,
  enforceLength,
  isTooSimilarReply,
  findMostSimilarReply,
} = require('../lib/text');

async function callOpenAI(messages, convoMeta = {}, extraInstruction = '') {
  const msgCount = convoMeta.message_count || 0;

  const recentAssistantReplies = messages
    .filter(m => m.role === 'assistant')
    .slice(-6)
    .map(m => m.content.trim())
    .filter(Boolean);

  let contextNote = `

conversation state:
- this is message #${msgCount} of 3 max
- sweet, warm, loving — make them feel adored
- one short line, max two
- if message is sexual/suggestive → flirty mode (playful, not explicit)

BIO RULE (critical):
- NEVER paste a URL. no exceptions.
- EVERY bio redirect MUST explicitly mention instagram/ig/insta as the problem
- never generic "come somewhere quieter" — always say WHY ig is the issue
- valid WHY angles: too many dms / restrictions / cant focus / too much noise / front door not home / ig limits / insta wont let me share
- example phrasings:
  - "ig is wild, my bio has me"
  - "im drowning in ig dms babe"
  - "insta wont let me share that, bio will"
  - "ig is just my front door, bio is where i live"
  - "cant focus on you here on ig, my bio i can"
- vary the bio reason each time (talk / see her / know her / private / attention)
- page is FREE
- never type "www", "http", or any domain
- "see u there" is FORBIDDEN unless explicitly told otherwise`;

  if (msgCount === 2) {
    contextNote += `

PUSH BIO WARMLY (message 2 of 3):
- explicitly name ig/instagram as the bottleneck
- examples:
  - "honestly im so behind on ig dms babe, come find me on my bio 💕"
  - "ig is wild, i cant focus on you here. my bio is where i actually am 🥺"
  - "instagram has too many limits cutie, my bio has the real me"
- stay sweet, never cold
- DO NOT use "see u there"`;
  } else if (msgCount === 3) {
    contextNote += `

FINAL REPLY (last message, message 3 of 3):
- name ig/instagram as the problem one last time
- warm, intimate, final invite
- END WITH "see u there" — REQUIRED (overrides the no-see-u-there rule for this final message)
- examples:
  - "ig is just too much babe, come find me on my bio. see u there 💕"
  - "i cant actually be here on ig, my bio is where i exist. see u there 🥺"
  - "instagram is my front door, bio is the rest. see u there"
- short, sweet, intimate`;
  }

  const avoidNote = recentAssistantReplies.length
    ? `

==================================================
your previous replies in this conversation (DO NOT REPEAT)
==================================================
${recentAssistantReplies.map((r, i) => `${i + 1}. "${r}"`).join('\n')}

hard rules:
- do not reuse any opener from above
- do not reuse the same sentence structure
- do not say the same thing the same way twice
- vary the IG-is-bad angle each time (volume / restrictions / noise / cant focus / etc.)`
    : '';

  const extraNote = extraInstruction ? `\n\nextra instruction:\n${extraInstruction}` : '';

  const fullPrompt = SYSTEM_PROMPT + contextNote + avoidNote + extraNote;

  let text = await callClaudeRaw('claude-haiku-4-5', fullPrompt, messages, 80);
  let finalText = humanizeReply(enforceLength(text));

  for (let attempt = 0; attempt < 2; attempt++) {
    if (!isTooSimilarReply(messages, finalText)) break;

    const offending = findMostSimilarReply(messages, finalText);
    const stricter =
      fullPrompt +
      `\n\nyour draft reply was too similar to a previous one. ${
        offending
          ? `you already said: "${offending}". do NOT use that phrasing, opener, or structure again.`
          : 'rephrase completely.'
      } same substance, totally different wording. shorter sentences, different opener.`;

    text = await callClaudeRaw('claude-haiku-4-5', stricter, messages, 80);
    finalText = humanizeReply(enforceLength(text));
  }

  return finalText;
}

module.exports = {
  callOpenAI,
};

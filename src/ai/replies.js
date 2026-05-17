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
- frame bio as the place where you actually exist properly (not lost in 1000s of dms)

BIO RULE (critical):
- NEVER paste a URL. no exceptions.
- core angle: ig is hectic / 1000s of dms — come somewhere private/quieter where you can actually talk, see her, know her, see private stuff
- vary the reason each time (talk, see more, get to know her, private content, attention) — never repeat
- page is FREE — if asked price, say free + bio
- never type "www", "http", or any domain
- the phrase "see u there" is FORBIDDEN unless explicitly told otherwise`;

  if (msgCount === 2) {
    contextNote += `

PUSH BIO WARMLY (this is message 2 of 3):
- warm funnel now with the "ig is overwhelming, lets go private" angle
- examples: "honestly im so behind on dms here babe, come find me somewhere quieter, my bio 💕", "ig is wild lol, lets go private — my bio has me", "i wanna give you my attention, just not here. my bio 🥺"
- stay sweet — never cold
- DO NOT use "see u there"`;
  } else if (msgCount === 3) {
    contextNote += `

FINAL REPLY (last message, message 3 of 3):
- after this you do not reply again on ig
- warm, intimate, final invite to find her where she actually exists
- END WITH the phrase "see u there" — REQUIRED (overrides the no-see-u-there rule for this final message)
- examples: "lets go somewhere private babe, my bio. see u there 💕", "come find me where i can actually be there for you, my bio. see u there 🥺", "ig is too much, real talk is on my bio. see u there"
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
- vary the BIO REASON each time (talk / see her / know her / private / attention)`
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

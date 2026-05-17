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
- always lean toward funneling to bio by msg 2-3

BIO RULE (critical):
- NEVER paste a URL. no exceptions.
- "real conversations happen on my bio" angle — invite warmly
- variations: "come find me on my bio babe 💕", "everything's on my bio cutie", "my page has it all 🥺"
- page is FREE — if asked price, say free + bio
- never type "www", "http", or any domain
- the phrase "see u there" is FORBIDDEN unless explicitly told otherwise`;

  if (msgCount === 2) {
    contextNote += `

PUSH BIO WARMLY (this is message 2 of 3):
- warm funnel to bio now
- "real conversations happen there" angle
- examples: "babe come find me on my bio, i can actually be there 💕", "i wanna talk more, its way better on my page cutie 🥺"
- stay sweet and loving — never cold
- DO NOT use "see u there"`;
  } else if (msgCount === 3) {
    contextNote += `

FINAL REPLY (last message, message 3 of 3):
- after this you do not reply again on ig
- warm loving final invite to find her on her bio
- END WITH the phrase "see u there" — REQUIRED (overrides the no-see-u-there rule for this final message)
- examples: "come find me on my bio babe, see u there 💕", "real talk happens on my page cutie, see u there 🥺", "i wanna chat properly on my bio, see u there"
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
- do not say the same thing the same way twice`
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

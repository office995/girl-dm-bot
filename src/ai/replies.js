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
- slightly aloof, busy creator energy
- one short line, never warm or enthusiastic
- NO pet names ever (no bby, baby, babe, hun, sweetie)
- match user energy LOW

BIO RULE (critical):
- NEVER paste a URL. no exceptions.
- "1000s of dms" angle — every reply hints at being busy or pushes to bio
- variations: "honestly i get so many dms here", "easier on my page, link in bio", "barely check ig, come find me bio"
- page is FREE — if asked price, say free + bio
- never type "www", "http", or any domain
- the word "laters" is FORBIDDEN unless explicitly told otherwise`;

  if (msgCount === 2) {
    contextNote += `

PUSH BIO HARD (this is message 2 of 3):
- harder funnel to bio now
- mention being busy / overwhelmed with dms
- examples: "honestly so behind on dms here, come to my bio", "easier on my page, link in bio", "ig is hectic, my bio has it"
- NO pet names. DO NOT use "laters"`;
  } else if (msgCount === 3) {
    contextNote += `

FINAL REPLY (last message, message 3 of 3):
- after this you do not reply again
- final dismissive push to bio
- END WITH "laters" — this is REQUIRED and overrides the no-laters rule
- short, slightly cold but not rude
- NO pet names
- examples: "thats it, find me on my bio. laters", "im out, come to my page. laters", "talk to me on my bio. laters"`;
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

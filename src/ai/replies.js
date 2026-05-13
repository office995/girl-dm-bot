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
- this is message #${msgCount}
- keep it concise
- one short line most of the time, two short lines max
- answer exactly what they asked
- stay natural and conversational

BIO RULE (critical):
- NEVER paste a URL in your reply. no exceptions.
- if they show buying intent (link, page, content, where, vip, price, custom, more pics, see more, etc.) — say it's in your bio
- variations OK: "its in my bio", "check my bio", "link in my bio bby", "all in my bio", "my bio has everything"
- the page is FREE — if they ask the price, say its free + redirect to bio
- never type "www", "http", or any domain`;

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

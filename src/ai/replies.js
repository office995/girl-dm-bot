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
- never type "www", "http", or any domain
- the word "xoxo" is FORBIDDEN — never use it in any reply (it has a special meaning reserved for one specific case)`;

  if (msgCount >= 4 && msgCount <= 7) {
    contextNote += `

PUSH BIO NOW (this is message ${msgCount}):
- conversation has been going for a while — every reply should include a bio nudge now
- still reply to what they actually said, but END with a casual bio reference
- examples: "anyway, the rest is in my bio bby", "come see me on my page, in bio", "u know where to find more 👀 my bio"
- keep it natural and warm, not aggressive — just keep dropping the bio mention each time
- DO NOT use the word "xoxo"`;
  } else if (msgCount === 8) {
    contextNote += `

FINAL PUSH (this is your last reply in this conversation):
- after this message, you will not reply again
- give them a clear, warm push to the bio
- make it feel like the natural next step, not a hard close
- IMPORTANT: end your reply with the word "xoxo" — this is your sign-off and is REQUIRED for this final message only (this overrides the normal "no xoxo" rule)
- examples: "ok come see me already bby, bio xoxo", "lets pick this up on my page bby, bio xoxo", "the convo continues there, my bio xoxo"`;
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

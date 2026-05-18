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
- voice: natural 19yo girl, casual, lowercase, slightly shy + flirty
- one short line, max two
- pull back from compliments ("ur funny" not "ur sweet")
- 1 emoji max, often none`;

  if (msgCount === 1) {
    contextNote += `

MESSAGE 1 (FIRST REPLY — be natural):
- react like a real 19yo just got a dm
- greeting → "Hiii" or short "hey 😏 what's up"
- compliment → pull back ("lol thanks" / "ur funny" / "aww stop")
- question → answer brief, maybe turn back ("florida. u?")
- sexual → playful tease ("lol forward" / "depends lol")
- NEVER mention bio, link, or page
- NEVER end with "see u there"
- short, casual, not pushy`;
  } else if (msgCount === 2) {
    contextNote += `

MESSAGE 2 (SECOND REPLY — keep convo going):
- continue naturally, react/answer/tease
- STILL NO bio mention (unless user directly asks for bio/link/page)
- STILL NO "see u there"
- short, casual
- a real girl wouldn't pitch her OF here yet`;
  } else if (msgCount === 3) {
    contextNote += `

MESSAGE 3 (FINAL REPLY — CLOSE IT):
- ALWAYS mention "link in my bio" or "click the link in my bio"
- ALWAYS end with "see u there" (REQUIRED — overrides no-see-u-there rule)
- vary the phrasing:
  - "click the link in my bio. see u there"
  - "the link in my bio has me. see u there"
  - "link in my bio babe. see u there 😏"
  - "prove it on the link in my bio. see u there"
  - "link in my bio if u wanna [talk/see more]. see u there"
- NEVER say "come to my bio" or "find me on my bio" — always LINK click
- short, confident`;
  }

  const avoidNote = recentAssistantReplies.length
    ? `

==================================================
your previous replies (DO NOT REPEAT)
==================================================
${recentAssistantReplies.map((r, i) => `${i + 1}. "${r}"`).join('\n')}

hard rules:
- do not reuse any opener from above
- do not reuse the same sentence structure
- vary the bio framing in msg 3`
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
      } same substance, totally different wording.`;

    text = await callClaudeRaw('claude-haiku-4-5', stricter, messages, 80);
    finalText = humanizeReply(enforceLength(text));
  }

  return finalText;
}

module.exports = {
  callOpenAI,
};

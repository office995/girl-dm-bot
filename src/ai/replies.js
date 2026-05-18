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
- voice: 19yr old playing hard to get, confident, slightly bratty, keeps them coming back
- one short line ideal, max two
- 😏 energy, never gushing/sweet/long emotional
- if user is suggestive → flirty challenge mode (tease, dare them to prove it, never explicit)

BIO RULE (critical):
- NEVER paste a URL. no exceptions.
- EVERY bio redirect names ig/instagram as the problem
- valid WHY angles: too many dms / restrictions / cant focus / too much noise / front door not home / ig is too crowded
- frame bio as the place to EARN IT / PROVE IT / STEP UP / TALK PERSONALLY
- vary the bio reason each time (talk privately / earn attention / show what u got / see more / prove it)
- page is FREE
- never type "www", "http", or any domain
- "see u there" is FORBIDDEN unless explicitly told otherwise

NEVER:
- gush ("aww babe so sweet")
- shut them down ("go away")
- long emotional replies
- rude or cruel
- volunteer personal info unprompted
- repeat the same opener/structure`;

  if (msgCount === 2) {
    contextNote += `

PUSH BIO (message 2 of 3) — with hard-to-get energy:
- name ig as the bottleneck
- frame bio as "earn it" / "show me what u got" / "talk personally" / "prove it"
- stay playful, never desperate
- examples:
  - "ig is too crowded babe. come find me on my bio if u got what it takes 😏"
  - "talk to me personally on my bio. ig isnt the place"
  - "if ur serious, my bio. ig is too hectic for me to focus"
- DO NOT use "see u there"`;
  } else if (msgCount === 3) {
    contextNote += `

FINAL REPLY (message 3 of 3) — last invite with attitude:
- name ig as the problem one last time
- final tease, leave them wanting more
- END WITH "see u there" — REQUIRED (overrides the no-see-u-there rule)
- examples:
  - "ig is too much babe. come find me where i actually exist — my bio. see u there 😏"
  - "im out of bandwidth here. my bio if u wanna actually talk. see u there"
  - "ur turn to make a move. bio. see u there 😏"
- short, confident, intimate`;
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
- vary the ig-is-bad angle each time
- vary the bio framing (earn it / show me / talk private / prove it / see more)`
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

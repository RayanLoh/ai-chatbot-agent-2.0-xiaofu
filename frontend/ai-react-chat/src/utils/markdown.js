export const normalizeBotMarkdown = (value = '') =>
  value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/"\*\*([^*]+)\*\*"/g, '**"$1"**')
    .replace(/'\*\*([^*]+)\*\*'/g, "**'$1'**")
    .replace(/\*\*\s+(["'])/g, '**$1')
    .replace(/(["'])\s+\*\*/g, '$1**');

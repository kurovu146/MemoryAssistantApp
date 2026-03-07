const SECRET_PATTERNS = [
  /sk-ant-[a-zA-Z0-9_-]{20,}/g, // Claude API keys
  /sk-[a-zA-Z0-9]{20,}/g, // OpenAI API keys
  /AIza[a-zA-Z0-9_-]{30,}/g, // Google API keys
  /ghp_[a-zA-Z0-9]{36}/g, // GitHub tokens
  /gho_[a-zA-Z0-9]{36}/g, // GitHub OAuth tokens
  /xoxb-[a-zA-Z0-9-]+/g, // Slack bot tokens
  /Bearer\s+[a-zA-Z0-9._~+/=-]{20,}/g, // Bearer tokens
];

export function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, match => {
      if (match.length <= 10) {
        return match;
      }
      return match.slice(0, 8) + '...' + match.slice(-4);
    });
  }
  return result;
}

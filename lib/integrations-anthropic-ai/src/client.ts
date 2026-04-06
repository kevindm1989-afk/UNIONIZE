import Anthropic from "@anthropic-ai/sdk";

// Lazy singleton — created on first use so a missing key only fails
// when the AI route is actually called, not at server startup.
let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (_client) return _client;

  const apiKey =
    process.env.ANTHROPIC_API_KEY ?? process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const baseURL = process.env.ANTHROPIC_API_KEY
    ? undefined // use Anthropic's default URL
    : process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;

  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it via: fly secrets set ANTHROPIC_API_KEY=sk-ant-...",
    );
  }

  _client = new Anthropic({ apiKey, baseURL });
  return _client;
}

// Backwards-compatible named export used by the route
export const anthropic = new Proxy({} as Anthropic, {
  get(_target, prop) {
    return (getAnthropicClient() as any)[prop];
  },
});

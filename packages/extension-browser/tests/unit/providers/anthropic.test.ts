import { describe, it, expect } from "vitest";
import { createAnthropicProvider } from "../../../src/lib/providers/anthropic.js";

interface FakeStream {
  on(event: string, cb: (delta: string) => void): void;
  finalMessage(): Promise<{ content: { type: string; text: string }[] }>;
}

function buildFakeClient(opts: {
  textChunks: string[];
  fail?: "auth" | "rate";
}): { messages: { stream: () => FakeStream; create: () => Promise<unknown> } } {
  return {
    messages: {
      stream() {
        const handlers: Record<string, (delta: string) => void> = {};
        const stream: FakeStream = {
          on(event, cb) {
            handlers[event] = cb;
          },
          async finalMessage() {
            if (opts.fail === "auth") throw new Error("401 unauthorized");
            if (opts.fail === "rate")
              throw new Error("429 rate_limit_exceeded");
            for (const t of opts.textChunks) handlers["text"]?.(t);
            return {
              content: [{ type: "text", text: opts.textChunks.join("") }],
            };
          },
        };
        return stream;
      },
      async create() {
        return {
          content: [{ type: "text", text: opts.textChunks.join("") }],
        };
      },
    },
  };
}

describe("anthropic provider", () => {
  it("streams deltas and returns aggregated text", async () => {
    const fakeClient = buildFakeClient({ textChunks: ['{"ok":', "true}"] });
    const provider = createAnthropicProvider({
      apiKey: "sk-ant-test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clientFactory: () => fakeClient as any,
    });
    const tokens: string[] = [];
    const result = await provider.complete({
      tool: "translate_incoming",
      prompt: "ping",
      model: "claude-haiku-4-5",
      onToken: (t) => tokens.push(t),
    });
    expect(result.text).toBe('{"ok":true}');
    expect(tokens).toEqual(['{"ok":', "true}"]);
    expect(result.provenance.provider).toBe("anthropic");
  });

  it("normalises 401 to ANTHROPIC_AUTH_FAILED", async () => {
    const fakeClient = buildFakeClient({ textChunks: [], fail: "auth" });
    const provider = createAnthropicProvider({
      apiKey: "sk-ant-bad",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clientFactory: () => fakeClient as any,
    });
    await expect(
      provider.complete({
        tool: "translate_incoming",
        prompt: "ping",
        model: "claude-haiku-4-5",
      })
    ).rejects.toThrow(/ANTHROPIC_AUTH_FAILED/);
  });

  it("refuses construction when apiKey is empty", () => {
    expect(() => createAnthropicProvider({ apiKey: "" })).toThrow(
      /ANTHROPIC_API_KEY_MISSING/
    );
  });
});

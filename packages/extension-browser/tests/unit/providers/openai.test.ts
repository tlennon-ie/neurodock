import { describe, it, expect } from "vitest";
import { createOpenAIProvider } from "../../../src/lib/providers/openai.js";

interface FakeChunk {
  choices: { delta: { content: string } }[];
}

function buildStreamingClient(opts: {
  chunks: string[];
  fail?: "auth" | "rate";
}): unknown {
  return {
    chat: {
      completions: {
        async create({ stream }: { stream?: boolean }) {
          if (opts.fail === "auth")
            throw new Error("401 Unauthorized invalid API key");
          if (opts.fail === "rate") throw new Error("429 rate_limit");
          if (stream) {
            const chunks: FakeChunk[] = opts.chunks.map((c) => ({
              choices: [{ delta: { content: c } }],
            }));
            return {
              async *[Symbol.asyncIterator]() {
                for (const c of chunks) yield c;
              },
            };
          }
          return { choices: [{ message: { content: opts.chunks.join("") } }] };
        },
      },
    },
  };
}

describe("openai provider", () => {
  it("streams deltas and aggregates text", async () => {
    const fakeClient = buildStreamingClient({
      chunks: ['{"o', 'k":', "true}"],
    });
    const provider = createOpenAIProvider({
      apiKey: "sk-test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clientFactory: () => fakeClient as any,
    });
    const tokens: string[] = [];
    const result = await provider.complete({
      tool: "translate_incoming",
      prompt: "ping",
      model: "gpt-4o-mini",
      onToken: (t) => tokens.push(t),
    });
    expect(result.text).toBe('{"ok":true}');
    expect(tokens.length).toBe(3);
    expect(result.provenance.provider).toBe("openai");
  });

  it("normalises 401 to OPENAI_AUTH_FAILED", async () => {
    const fakeClient = buildStreamingClient({ chunks: [], fail: "auth" });
    const provider = createOpenAIProvider({
      apiKey: "sk-bad",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clientFactory: () => fakeClient as any,
    });
    let err: unknown;
    try {
      await provider.complete({
        tool: "translate_incoming",
        prompt: "ping",
        model: "gpt-4o-mini",
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(/OPENAI_AUTH_FAILED/);
  });

  it("refuses construction when apiKey is empty", () => {
    expect(() => createOpenAIProvider({ apiKey: "" })).toThrow(
      /OPENAI_API_KEY_MISSING/,
    );
  });
});

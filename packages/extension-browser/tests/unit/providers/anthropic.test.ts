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
    let err: unknown;
    try {
      await provider.complete({
        tool: "translate_incoming",
        prompt: "ping",
        model: "claude-haiku-4-5",
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(/ANTHROPIC_AUTH_FAILED/);
  });

  it("refuses construction when apiKey is empty", () => {
    expect(() => createAnthropicProvider({ apiKey: "" })).toThrow(
      /ANTHROPIC_API_KEY_MISSING/,
    );
  });

  // P1.6 — Anthropic 404 / not_found_error now surfaces a dedicated
  // ANTHROPIC_MODEL_NOT_FOUND prefix so the UI can hint at the stale
  // hardcoded model list rather than showing an opaque ANTHROPIC_ERROR.
  it("maps 404 / not_found_error to ANTHROPIC_MODEL_NOT_FOUND", async () => {
    const failingClient = {
      messages: {
        stream() {
          return {
            on() {},
            async finalMessage() {
              throw new Error("404 model not_found_error: model not found");
            },
          };
        },
        async create() {
          throw new Error("404 model not_found_error: model not found");
        },
      },
    };
    const provider = createAnthropicProvider({
      apiKey: "sk-ant-test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clientFactory: () => failingClient as any,
    });
    let err: unknown;
    try {
      await provider.complete({
        tool: "translate_incoming",
        prompt: "ping",
        model: "claude-imaginary",
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(/ANTHROPIC_MODEL_NOT_FOUND/);
  });

  // P1.5 — Anthropic does not support response_format. We compensate by
  // sending a system instruction telling the model to return a single
  // JSON object with no prose. Verify the system field is present on the
  // outgoing request shape (covers both streaming and non-streaming
  // paths to prevent silent regression).
  it("sends a JSON-mode system prompt on every request", async () => {
    const capturedStream: { system?: string }[] = [];
    const capturedCreate: { system?: string }[] = [];
    const recordingClient = {
      messages: {
        stream(args: { system?: string }) {
          capturedStream.push({ system: args.system });
          return {
            on() {},
            async finalMessage() {
              return { content: [{ type: "text", text: '{"ok":true}' }] };
            },
          };
        },
        async create(args: { system?: string }) {
          capturedCreate.push({ system: args.system });
          return { content: [{ type: "text", text: '{"ok":true}' }] };
        },
      },
    };
    const streamingProvider = createAnthropicProvider({
      apiKey: "sk-ant-test",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clientFactory: () => recordingClient as any,
    });
    await streamingProvider.complete({
      tool: "translate_incoming",
      prompt: "ping",
      model: "claude-haiku-4-5",
    });
    expect(capturedStream.length).toBe(1);
    expect(capturedStream[0]!.system).toMatch(/single JSON object/i);

    const nonStreamingProvider = createAnthropicProvider({
      apiKey: "sk-ant-test",
      disableStreaming: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clientFactory: () => recordingClient as any,
    });
    await nonStreamingProvider.complete({
      tool: "translate_incoming",
      prompt: "ping",
      model: "claude-haiku-4-5",
    });
    expect(capturedCreate.length).toBe(1);
    expect(capturedCreate[0]!.system).toMatch(/single JSON object/i);
  });
});

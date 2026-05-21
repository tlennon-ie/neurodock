import { describe, it, expect, vi } from "vitest";
import { createOllamaProvider } from "../../../src/lib/providers/ollama.js";

function mockResponse(body: string, ok = true): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, { status: ok ? 200 : 500 });
}

describe("ollama provider", () => {
  it("aggregates NDJSON deltas and forwards each via onToken", async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse(
        [
          JSON.stringify({ response: "{", done: false }),
          JSON.stringify({ response: '"ok":', done: false }),
          JSON.stringify({ response: "true}", done: true }),
        ].join("\n"),
      ),
    );
    const provider = createOllamaProvider({
      endpoint: "http://localhost:11434",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const tokens: string[] = [];
    const result = await provider.complete({
      tool: "translate_incoming",
      prompt: "test",
      model: "llama3.2:3b",
      onToken: (t) => tokens.push(t),
    });
    expect(result.text).toBe('{"ok":true}');
    expect(tokens.join("")).toBe('{"ok":true}');
    expect(result.provenance).toEqual({
      mode: "local",
      provider: "ollama",
      model: "llama3.2:3b",
    });
  });

  it("throws OLLAMA_UNREACHABLE when fetch rejects", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const provider = createOllamaProvider({
      endpoint: "http://localhost:11434",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    let err: unknown;
    try {
      await provider.complete({
        tool: "translate_incoming",
        prompt: "test",
        model: "llama3.2:3b",
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(/OLLAMA_UNREACHABLE/);
  });

  it("throws OLLAMA_PERMISSION_REQUIRED when hasPermission returns false (v0.0.4)", async () => {
    const fetchImpl = vi.fn(async () => new Response(""));
    const hasPermission = vi.fn(async () => false);
    const provider = createOllamaProvider({
      endpoint: "http://169.254.83.107:11434",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      hasPermission,
    });
    let err: unknown;
    try {
      await provider.complete({
        tool: "translate_incoming",
        prompt: "test",
        model: "llama3.2:3b",
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(/OLLAMA_PERMISSION_REQUIRED/);
    expect((err as Error).message).toMatch(/169\.254\.83\.107:11434/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("proceeds normally when hasPermission returns true (v0.0.4)", async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse(JSON.stringify({ response: "hi", done: true })),
    );
    const hasPermission = vi.fn(async () => true);
    const provider = createOllamaProvider({
      endpoint: "http://169.254.83.107:11434",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      hasPermission,
    });
    const result = await provider.complete({
      tool: "translate_incoming",
      prompt: "test",
      model: "llama3.2:3b",
    });
    expect(result.text).toBe("hi");
    expect(hasPermission).toHaveBeenCalledTimes(1);
  });

  it("throws OLLAMA_HTTP_<status> on non-2xx responses", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("Internal Server Error", {
          status: 500,
          statusText: "Internal Server Error",
        }),
    );
    const provider = createOllamaProvider({
      endpoint: "http://localhost:11434",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    let err: unknown;
    try {
      await provider.complete({
        tool: "translate_incoming",
        prompt: "test",
        model: "llama3.2:3b",
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(/OLLAMA_HTTP_500/);
  });
});

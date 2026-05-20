import { describe, it, expect, vi } from "vitest";
import { createOpenRouterProvider } from "../../../src/lib/providers/openrouter.js";

interface CapturedRequest {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) {
        const payload = { choices: [{ delta: { content: c } }] };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n`),
        );
      }
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
}

function buildSseResponse(chunks: string[]): Response {
  return new Response(sseStream(chunks), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function buildJsonResponse(
  status: number,
  body: unknown,
  contentType = "application/json",
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": contentType },
  });
}

describe("openrouter provider", () => {
  it("streams SSE deltas and aggregates text via onToken", async () => {
    const captured: CapturedRequest[] = [];
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      captured.push({ url, init });
      return buildSseResponse(['{"o', 'k":', "true}"]);
    }) as unknown as typeof fetch;

    const provider = createOpenRouterProvider({
      apiKey: "sk-or-test",
      fetchImpl: fakeFetch,
    });

    const tokens: string[] = [];
    const result = await provider.complete({
      tool: "translate_incoming",
      prompt: "ping",
      model: "openrouter/auto",
      onToken: (t) => tokens.push(t),
    });

    expect(result.text).toBe('{"ok":true}');
    expect(tokens).toEqual(['{"o', 'k":', "true}"]);
    expect(result.provenance.provider).toBe("openrouter");
    expect(result.provenance.mode).toBe("cloud");
    expect(result.provenance.model).toBe("openrouter/auto");

    // Verify the request shape — base URL, auth, attribution headers.
    expect(captured.length).toBe(1);
    const first = captured[0]!;
    expect(first.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const headers = first.init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk-or-test");
    expect(headers["HTTP-Referer"]).toBe("https://neurodock.org");
    expect(headers["X-Title"]).toBe("NeuroDock");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(first.init?.body as string) as {
      model: string;
      stream: boolean;
      messages: { role: string; content: string }[];
    };
    expect(body.model).toBe("openrouter/auto");
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual([{ role: "user", content: "ping" }]);
  });

  it("normalises 401 to OPENROUTER_AUTH_FAILED with a clear message", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(401, {
        error: { message: "Invalid API key", code: 401 },
      }),
    ) as unknown as typeof fetch;

    const provider = createOpenRouterProvider({
      apiKey: "sk-or-bad",
      fetchImpl: fakeFetch,
    });

    let err: unknown;
    try {
      await provider.complete({
        tool: "translate_incoming",
        prompt: "ping",
        model: "openrouter/auto",
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(
      /OPENROUTER_AUTH_FAILED.*(rejected|invalid)/i,
    );
  });

  it("normalises 429 to OPENROUTER_RATE_LIMITED", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(429, {
        error: { message: "rate_limit_exceeded", code: 429 },
      }),
    ) as unknown as typeof fetch;

    const provider = createOpenRouterProvider({
      apiKey: "sk-or-test",
      fetchImpl: fakeFetch,
    });

    let err: unknown;
    try {
      await provider.complete({
        tool: "translate_incoming",
        prompt: "ping",
        model: "openrouter/auto",
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(/OPENROUTER_RATE_LIMITED/);
  });

  it("refuses construction when apiKey is empty", () => {
    expect(() => createOpenRouterProvider({ apiKey: "" })).toThrow(
      /OPENROUTER_API_KEY_MISSING/,
    );
  });

  it("uses openrouter/auto as the default-router slug when caller passes it through", async () => {
    // This test asserts that the provider does NOT mangle the auto-router
    // slug. The default lives in translation-client.ts's DEFAULT_MODELS;
    // the provider is responsible for passing it through verbatim.
    const captured: CapturedRequest[] = [];
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      captured.push({ url, init });
      return buildSseResponse(['{"ok":true}']);
    }) as unknown as typeof fetch;

    const provider = createOpenRouterProvider({
      apiKey: "sk-or-test",
      fetchImpl: fakeFetch,
    });

    await provider.complete({
      tool: "translate_incoming",
      prompt: "ping",
      model: "openrouter/auto",
    });

    const first = captured[0]!;
    const body = JSON.parse(first.init?.body as string) as { model: string };
    expect(body.model).toBe("openrouter/auto");
  });

  it("falls back to JSON parsing when the response is not an event stream", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(200, {
        choices: [{ message: { content: '{"ok":true}' } }],
      }),
    ) as unknown as typeof fetch;

    const provider = createOpenRouterProvider({
      apiKey: "sk-or-test",
      fetchImpl: fakeFetch,
    });

    const tokens: string[] = [];
    const result = await provider.complete({
      tool: "translate_incoming",
      prompt: "ping",
      model: "anthropic/claude-3-5-sonnet",
      onToken: (t) => tokens.push(t),
    });
    expect(result.text).toBe('{"ok":true}');
    expect(tokens).toEqual(['{"ok":true}']);
  });

  it("normalises 402 to OPENROUTER_INSUFFICIENT_CREDITS", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(402, {
        error: { message: "Insufficient credits", code: 402 },
      }),
    ) as unknown as typeof fetch;

    const provider = createOpenRouterProvider({
      apiKey: "sk-or-test",
      fetchImpl: fakeFetch,
    });

    let err: unknown;
    try {
      await provider.complete({
        tool: "translate_incoming",
        prompt: "ping",
        model: "openrouter/auto",
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(/OPENROUTER_INSUFFICIENT_CREDITS/);
  });
});

import { describe, it, expect, vi } from "vitest";
import {
  createGoogleProvider,
  fetchGoogleModels,
  isVisionCapableGoogleModel,
  GOOGLE_BASE_URL,
  GOOGLE_DEFAULT_MODEL,
} from "../../../src/lib/providers/google.js";

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

describe("google provider", () => {
  it("streams SSE deltas and aggregates text via onToken", async () => {
    const captured: CapturedRequest[] = [];
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      captured.push({ url, init });
      return buildSseResponse(['{"o', 'k":', "true}"]);
    }) as unknown as typeof fetch;

    const provider = createGoogleProvider({
      apiKey: "AIza-test",
      fetchImpl: fakeFetch,
    });

    const tokens: string[] = [];
    const result = await provider.complete({
      tool: "translate_incoming",
      prompt: "ping",
      model: GOOGLE_DEFAULT_MODEL,
      onToken: (t) => tokens.push(t),
    });

    expect(result.text).toBe('{"ok":true}');
    expect(tokens).toEqual(['{"o', 'k":', "true}"]);
    expect(result.provenance.provider).toBe("google");
    expect(result.provenance.mode).toBe("cloud");
    expect(result.provenance.model).toBe(GOOGLE_DEFAULT_MODEL);

    // Verify the request shape — base URL, auth header, body.
    expect(captured.length).toBe(1);
    const first = captured[0]!;
    expect(first.url).toBe(`${GOOGLE_BASE_URL}/chat/completions`);
    const headers = first.init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer AIza-test");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(first.init?.body as string) as {
      model: string;
      stream: boolean;
      messages: { role: string; content: string }[];
    };
    expect(body.model).toBe(GOOGLE_DEFAULT_MODEL);
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual([{ role: "user", content: "ping" }]);
  });

  it("normalises 401 to GOOGLE_AUTH_FAILED with a clear message", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(401, {
        error: { message: "API key not valid", code: 401 },
      }),
    ) as unknown as typeof fetch;

    const provider = createGoogleProvider({
      apiKey: "AIza-bad",
      fetchImpl: fakeFetch,
    });

    let err: unknown;
    try {
      await provider.complete({
        tool: "translate_incoming",
        prompt: "ping",
        model: GOOGLE_DEFAULT_MODEL,
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/GOOGLE_AUTH_FAILED.*rejected/i);
  });

  it("normalises 429 to GOOGLE_HTTP_429 / rate limited", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(429, {
        error: { message: "Quota exceeded", code: 429 },
      }),
    ) as unknown as typeof fetch;

    const provider = createGoogleProvider({
      apiKey: "AIza-test",
      fetchImpl: fakeFetch,
    });

    let err: unknown;
    try {
      await provider.complete({
        tool: "translate_incoming",
        prompt: "ping",
        model: GOOGLE_DEFAULT_MODEL,
      });
    } catch (e) {
      err = e;
    }
    // 429 matches the rate-limit branch first (status code OR quota text).
    expect((err as Error).message).toMatch(/GOOGLE_RATE_LIMITED/);
  });

  it("normalises a generic 429 (no body match) still as rate-limited", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(429, {
        error: { message: "Too many requests", code: 429 },
      }),
    ) as unknown as typeof fetch;

    const provider = createGoogleProvider({
      apiKey: "AIza-test",
      fetchImpl: fakeFetch,
    });

    let err: unknown;
    try {
      await provider.complete({
        tool: "translate_incoming",
        prompt: "ping",
        model: GOOGLE_DEFAULT_MODEL,
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(/GOOGLE_RATE_LIMITED/);
  });

  it("surfaces other HTTP errors with the GOOGLE_HTTP_<status> prefix", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(500, {
        error: { message: "Internal error", code: 500 },
      }),
    ) as unknown as typeof fetch;

    const provider = createGoogleProvider({
      apiKey: "AIza-test",
      fetchImpl: fakeFetch,
    });

    let err: unknown;
    try {
      await provider.complete({
        tool: "translate_incoming",
        prompt: "ping",
        model: GOOGLE_DEFAULT_MODEL,
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(/GOOGLE_HTTP_500/);
  });

  it("refuses construction when apiKey is empty", () => {
    expect(() => createGoogleProvider({ apiKey: "" })).toThrow(
      /GOOGLE_API_KEY_MISSING/,
    );
  });

  it("passes image URLs through verbatim (no base64 pre-fetch)", async () => {
    const captured: CapturedRequest[] = [];
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      captured.push({ url, init });
      return buildSseResponse(['{"ok":true}']);
    }) as unknown as typeof fetch;

    const provider = createGoogleProvider({
      apiKey: "AIza-test",
      fetchImpl: fakeFetch,
    });

    const imageUrl = "https://example.com/screenshot.png";
    await provider.complete({
      tool: "describe_image",
      prompt: "describe this",
      model: "gemini-2.0-flash",
      images: [imageUrl],
    });

    const first = captured[0]!;
    const body = JSON.parse(first.init?.body as string) as {
      messages: Array<{
        role: string;
        content:
          | string
          | Array<
              | { type: "text"; text: string }
              | { type: "image_url"; image_url: { url: string } }
            >;
      }>;
    };
    const content = body.messages[0]!.content;
    expect(Array.isArray(content)).toBe(true);
    expect(content).toEqual([
      { type: "text", text: "describe this" },
      { type: "image_url", image_url: { url: imageUrl } },
    ]);
  });

  it("throws VISION_MODEL_REQUIRED for non-vision Gemini slugs", async () => {
    const fakeFetch = vi.fn(async () =>
      buildSseResponse(['{"ok":true}']),
    ) as unknown as typeof fetch;

    const provider = createGoogleProvider({
      apiKey: "AIza-test",
      fetchImpl: fakeFetch,
    });

    let err: unknown;
    try {
      await provider.complete({
        tool: "describe_image",
        prompt: "describe this",
        model: "text-embedding-004",
        images: ["https://example.com/x.png"],
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(/VISION_MODEL_REQUIRED/);
  });

  it("falls back to JSON parsing when the response is not an event stream", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(200, {
        choices: [{ message: { content: '{"ok":true}' } }],
      }),
    ) as unknown as typeof fetch;

    const provider = createGoogleProvider({
      apiKey: "AIza-test",
      fetchImpl: fakeFetch,
    });

    const tokens: string[] = [];
    const result = await provider.complete({
      tool: "translate_incoming",
      prompt: "ping",
      model: "gemini-2.5-flash",
      onToken: (t) => tokens.push(t),
    });
    expect(result.text).toBe('{"ok":true}');
    expect(tokens).toEqual(['{"ok":true}']);
  });

  it("retries without response_format when upstream model rejects it", async () => {
    const captured: CapturedRequest[] = [];
    let call = 0;
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      captured.push({ url, init });
      call += 1;
      if (call === 1) {
        return buildJsonResponse(400, {
          error: {
            message: "response_format is not supported for this model",
            code: 400,
          },
        });
      }
      return buildSseResponse(['{"ok":true}']);
    }) as unknown as typeof fetch;

    const provider = createGoogleProvider({
      apiKey: "AIza-test",
      fetchImpl: fakeFetch,
    });
    const result = await provider.complete({
      tool: "translate_incoming",
      prompt: "ping",
      model: "gemini-2.0-flash",
    });
    expect(result.text).toBe('{"ok":true}');
    expect(captured.length).toBe(2);
    const firstBody = JSON.parse(captured[0]!.init?.body as string) as Record<
      string,
      unknown
    >;
    const secondBody = JSON.parse(captured[1]!.init?.body as string) as Record<
      string,
      unknown
    >;
    expect(firstBody.response_format).toEqual({ type: "json_object" });
    expect(secondBody.response_format).toBeUndefined();
  });
});

describe("isVisionCapableGoogleModel", () => {
  it("returns true for gemini-1.5 / 2.0 / 2.5 families", () => {
    expect(isVisionCapableGoogleModel("gemini-1.5-flash")).toBe(true);
    expect(isVisionCapableGoogleModel("gemini-1.5-pro")).toBe(true);
    expect(isVisionCapableGoogleModel("gemini-2.0-flash")).toBe(true);
    expect(isVisionCapableGoogleModel("gemini-2.0-flash-exp")).toBe(true);
    expect(isVisionCapableGoogleModel("gemini-2.5-flash")).toBe(true);
  });

  it("returns false for unrecognised or text-only slugs", () => {
    expect(isVisionCapableGoogleModel("text-embedding-004")).toBe(false);
    expect(isVisionCapableGoogleModel("gemini-pro")).toBe(false);
    expect(isVisionCapableGoogleModel("aqa")).toBe(false);
    expect(isVisionCapableGoogleModel("not-a-real-model")).toBe(false);
  });
});

describe("fetchGoogleModels", () => {
  it("parses the OpenAI-shape data array and strips the models/ prefix", async () => {
    const captured: CapturedRequest[] = [];
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      captured.push({ url, init });
      return buildJsonResponse(200, {
        data: [
          { id: "models/gemini-2.0-flash" },
          { id: "models/gemini-2.5-flash" },
          { id: "models/gemini-1.5-pro" },
          { id: "models/text-embedding-004" },
        ],
      });
    }) as unknown as typeof fetch;

    const models = await fetchGoogleModels({
      apiKey: "AIza-test",
      fetchImpl: fakeFetch,
    });

    expect(captured[0]!.url).toBe(`${GOOGLE_BASE_URL}/models`);
    const headers = captured[0]!.init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer AIza-test");

    // chat-eligible Gemini slugs surface; embedding model filtered out.
    expect(models).toEqual([
      "gemini-2.0-flash",
      "gemini-2.5-flash",
      "gemini-1.5-pro",
    ]);
  });

  it("throws GOOGLE_API_KEY_MISSING when the key is empty", async () => {
    await expect(fetchGoogleModels({ apiKey: "" })).rejects.toThrow(
      /GOOGLE_API_KEY_MISSING/,
    );
  });

  it("surfaces 401 as GOOGLE_AUTH_FAILED", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(401, { error: { message: "bad key" } }),
    ) as unknown as typeof fetch;
    await expect(
      fetchGoogleModels({ apiKey: "AIza-bad", fetchImpl: fakeFetch }),
    ).rejects.toThrow(/GOOGLE_AUTH_FAILED/);
  });
});

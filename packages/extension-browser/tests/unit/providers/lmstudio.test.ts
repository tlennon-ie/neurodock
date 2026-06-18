import { describe, it, expect, vi } from "vitest";
import {
  createLMStudioProvider,
  fetchLMStudioModels,
  LMSTUDIO_DEFAULT_BASE_URL,
  normaliseLMStudioBaseUrl,
} from "../../../src/lib/providers/lmstudio.js";

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

function buildJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("normaliseLMStudioBaseUrl", () => {
  it("appends /v1 when the user pastes the bare server URL", () => {
    expect(normaliseLMStudioBaseUrl("http://localhost:1234")).toBe(
      "http://localhost:1234/v1",
    );
  });

  it("strips a trailing slash before deciding", () => {
    expect(normaliseLMStudioBaseUrl("http://localhost:1234/")).toBe(
      "http://localhost:1234/v1",
    );
  });

  it("leaves URLs that already end in /v1 untouched", () => {
    expect(normaliseLMStudioBaseUrl("http://localhost:1234/v1")).toBe(
      "http://localhost:1234/v1",
    );
  });

  it("handles a non-localhost host (LAN, Tailscale, APIPA)", () => {
    expect(normaliseLMStudioBaseUrl("http://169.254.83.107:1234")).toBe(
      "http://169.254.83.107:1234/v1",
    );
  });

  it("falls back to the default when given an empty string", () => {
    expect(normaliseLMStudioBaseUrl("")).toBe("http://localhost:1234/v1");
  });
});

describe("lmstudio provider", () => {
  it("appends /v1 when the user supplies a bare base URL (regression: 'OK got 0 chars' bug)", async () => {
    const captured: CapturedRequest[] = [];
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      captured.push({ url, init });
      return buildSseResponse(['{"ok":true}']);
    }) as unknown as typeof fetch;

    const provider = createLMStudioProvider({
      baseUrl: "http://localhost:1234",
      fetchImpl: fakeFetch,
    });
    await provider.complete({
      tool: "translate_incoming",
      prompt: "ping",
      model: "qwen2.5-7b-instruct",
    });
    expect(captured[0]!.url).toBe("http://localhost:1234/v1/chat/completions");
  });

  it("streams SSE deltas and aggregates text via onToken", async () => {
    const captured: CapturedRequest[] = [];
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      captured.push({ url, init });
      return buildSseResponse(['{"o', 'k":', "true}"]);
    }) as unknown as typeof fetch;

    const provider = createLMStudioProvider({
      baseUrl: LMSTUDIO_DEFAULT_BASE_URL,
      fetchImpl: fakeFetch,
    });

    const tokens: string[] = [];
    const result = await provider.complete({
      tool: "translate_incoming",
      prompt: "ping",
      model: "qwen2.5-7b-instruct",
      onToken: (t) => tokens.push(t),
    });

    expect(result.text).toBe('{"ok":true}');
    expect(tokens).toEqual(['{"o', 'k":', "true}"]);
    expect(result.provenance.provider).toBe("lmstudio");
    expect(result.provenance.mode).toBe("local");
    expect(result.provenance.model).toBe("qwen2.5-7b-instruct");

    expect(captured.length).toBe(1);
    const first = captured[0]!;
    expect(first.url).toBe("http://localhost:1234/v1/chat/completions");
    const headers = first.init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    // No auth header when no key is set.
    expect(headers["Authorization"]).toBeUndefined();

    const body = JSON.parse(first.init?.body as string) as {
      model: string;
      stream: boolean;
      messages: { role: string; content: string }[];
      response_format?: { type: string };
    };
    expect(body.model).toBe("qwen2.5-7b-instruct");
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual([{ role: "user", content: "ping" }]);
    // Contract pin (0.0.38): LM Studio MUST request grammar-constrained
    // structured output via `response_format.type === "json_schema"`.
    // Plain `text` mode left weak local models (gemma-4-e4b) free to emit
    // prose, so `extractJson` found no object and every call failed with
    // LLM_OUTPUT_VALIDATION_FAILED. `json_object` is NOT usable — LM Studio
    // 400s on it ("must be 'json_schema' or 'text'"); json_schema is the
    // mode its own error message points to.
    expect(body.response_format?.type).toBe("json_schema");
  });

  it("uses response_format=json_schema on the non-streaming path too", async () => {
    const captured: CapturedRequest[] = [];
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      captured.push({ url, init });
      return buildJsonResponse(200, {
        choices: [{ message: { content: '{"ok":true}' } }],
      });
    }) as unknown as typeof fetch;

    const provider = createLMStudioProvider({
      baseUrl: LMSTUDIO_DEFAULT_BASE_URL,
      fetchImpl: fakeFetch,
      disableStreaming: true,
    });
    await provider.complete({
      tool: "translate_incoming",
      prompt: "ping",
      model: "qwen2.5-7b-instruct",
    });
    const body = JSON.parse(captured[0]!.init?.body as string) as {
      stream: boolean;
      response_format?: { type: string };
    };
    expect(body.stream).toBe(false);
    expect(body.response_format?.type).toBe("json_schema");
  });

  it("sends the tool's model-facing output schema (with content fields, without server-owned fields) (0.0.38: fixes gemma-4-e4b prose responses)", async () => {
    const captured: CapturedRequest[] = [];
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      captured.push({ url, init });
      return buildSseResponse(['{"ok":true}']);
    }) as unknown as typeof fetch;

    const provider = createLMStudioProvider({
      baseUrl: LMSTUDIO_DEFAULT_BASE_URL,
      fetchImpl: fakeFetch,
    });
    await provider.complete({
      tool: "translate_incoming",
      prompt: "ping",
      model: "gemma-4-e4b",
    });

    const body = JSON.parse(captured[0]!.init?.body as string) as {
      response_format?: {
        type: string;
        json_schema?: {
          name: string;
          strict: boolean;
          schema: { properties?: Record<string, unknown> };
        };
      };
    };
    expect(body.response_format?.type).toBe("json_schema");
    expect(body.response_format?.json_schema?.name).toBe("translate_incoming");
    expect(body.response_format?.json_schema?.strict).toBe(true);
    const props = body.response_format?.json_schema?.schema.properties ?? {};
    expect(Object.keys(props)).toContain("explicit_ask");
    // The server owns provenance (ADR 0005); a strict grammar must not
    // force the model to invent it.
    expect(Object.keys(props)).not.toContain("model_provenance");
    expect(Object.keys(props)).not.toContain("eval_corpus_slice");
  });

  it("retries in text mode when LM Studio rejects structured output with a 400 (streaming)", async () => {
    const bodies: string[] = [];
    let call = 0;
    const fakeFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(init?.body as string);
      call += 1;
      if (call === 1) {
        return buildJsonResponse(400, {
          error: {
            message: "this model does not support json_schema response_format",
          },
        });
      }
      return buildSseResponse(['{"ok":true}']);
    }) as unknown as typeof fetch;

    const provider = createLMStudioProvider({
      baseUrl: LMSTUDIO_DEFAULT_BASE_URL,
      fetchImpl: fakeFetch,
    });
    const result = await provider.complete({
      tool: "translate_incoming",
      prompt: "ping",
      model: "gemma-4-e4b",
    });

    expect(result.text).toBe('{"ok":true}');
    expect(fakeFetch).toHaveBeenCalledTimes(2);
    const first = JSON.parse(bodies[0]!) as {
      response_format?: { type: string };
    };
    const second = JSON.parse(bodies[1]!) as {
      response_format?: { type: string };
    };
    expect(first.response_format?.type).toBe("json_schema");
    expect(second.response_format).toEqual({ type: "text" });
  });

  it("retries in text mode on the non-streaming path too when structured output is rejected", async () => {
    const bodies: string[] = [];
    let call = 0;
    const fakeFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(init?.body as string);
      call += 1;
      if (call === 1) {
        return buildJsonResponse(400, {
          error: { message: "Invalid response_format for this model" },
        });
      }
      return buildJsonResponse(200, {
        choices: [{ message: { content: '{"ok":true}' } }],
      });
    }) as unknown as typeof fetch;

    const provider = createLMStudioProvider({
      baseUrl: LMSTUDIO_DEFAULT_BASE_URL,
      fetchImpl: fakeFetch,
      disableStreaming: true,
    });
    const result = await provider.complete({
      tool: "translate_incoming",
      prompt: "ping",
      model: "gemma-4-e4b",
    });

    expect(result.text).toBe('{"ok":true}');
    expect(fakeFetch).toHaveBeenCalledTimes(2);
    const second = JSON.parse(bodies[1]!) as {
      response_format?: { type: string };
    };
    expect(second.response_format).toEqual({ type: "text" });
  });

  it("does NOT retry on a 400 unrelated to response_format (e.g. context length)", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(400, {
        error: { message: "context length exceeded" },
      }),
    ) as unknown as typeof fetch;

    const provider = createLMStudioProvider({
      baseUrl: LMSTUDIO_DEFAULT_BASE_URL,
      fetchImpl: fakeFetch,
    });
    let err: unknown;
    try {
      await provider.complete({
        tool: "translate_incoming",
        prompt: "ping",
        model: "gemma-4-e4b",
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(/LMSTUDIO_HTTP_400/);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("attaches Bearer auth when an apiKey is provided", async () => {
    const captured: CapturedRequest[] = [];
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      captured.push({ url, init });
      return buildSseResponse(['{"ok":true}']);
    }) as unknown as typeof fetch;

    const provider = createLMStudioProvider({
      baseUrl: LMSTUDIO_DEFAULT_BASE_URL,
      apiKey: "lm-proxy-secret",
      fetchImpl: fakeFetch,
    });

    await provider.complete({
      tool: "translate_incoming",
      prompt: "ping",
      model: "llama-3.1-8b",
    });

    const headers = captured[0]?.init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer lm-proxy-secret");
  });

  it("normalises 401 to LMSTUDIO_AUTH_FAILED", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(401, {
        error: { message: "Invalid API key" },
      }),
    ) as unknown as typeof fetch;

    const provider = createLMStudioProvider({
      baseUrl: LMSTUDIO_DEFAULT_BASE_URL,
      apiKey: "bad",
      fetchImpl: fakeFetch,
    });

    let err: unknown;
    try {
      await provider.complete({
        tool: "translate_incoming",
        prompt: "ping",
        model: "llama-3.1-8b",
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/LMSTUDIO_AUTH_FAILED/);
  });

  it("normalises a 404 model-not-found into a user-friendly message", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(404, {
        error: { message: "model 'nope' not found" },
      }),
    ) as unknown as typeof fetch;

    const provider = createLMStudioProvider({
      baseUrl: LMSTUDIO_DEFAULT_BASE_URL,
      fetchImpl: fakeFetch,
    });

    let err: unknown;
    try {
      await provider.complete({
        tool: "translate_incoming",
        prompt: "ping",
        model: "nope",
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(/LMSTUDIO_MODEL_NOT_FOUND/);
  });

  it("throws LMSTUDIO_UNREACHABLE when fetch rejects", async () => {
    const fakeFetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    const provider = createLMStudioProvider({
      baseUrl: LMSTUDIO_DEFAULT_BASE_URL,
      fetchImpl: fakeFetch,
    });

    let err: unknown;
    try {
      await provider.complete({
        tool: "translate_incoming",
        prompt: "ping",
        model: "llama-3.1-8b",
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(/LMSTUDIO_UNREACHABLE/);
  });

  it("throws LMSTUDIO_PERMISSION_REQUIRED when hasPermission returns false (v0.0.4)", async () => {
    const fakeFetch = vi.fn(async () => buildSseResponse(['{"ok":true}']));
    const hasPermission = vi.fn(async () => false);
    const provider = createLMStudioProvider({
      baseUrl: "http://169.254.83.107:1234/v1",
      fetchImpl: fakeFetch as unknown as typeof fetch,
      hasPermission,
    });
    let err: unknown;
    try {
      await provider.complete({
        tool: "translate_incoming",
        prompt: "ping",
        model: "phi-4",
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/LMSTUDIO_PERMISSION_REQUIRED/);
    expect((err as Error).message).toMatch(/169\.254\.83\.107:1234/);
    expect(fakeFetch).not.toHaveBeenCalled();
    expect(hasPermission).toHaveBeenCalledWith("http://169.254.83.107:1234/v1");
  });

  it("proceeds normally when hasPermission returns true (v0.0.4)", async () => {
    const fakeFetch = vi.fn(async () => buildSseResponse(['{"ok":true}']));
    const hasPermission = vi.fn(async () => true);
    const provider = createLMStudioProvider({
      baseUrl: "http://169.254.83.107:1234/v1",
      fetchImpl: fakeFetch as unknown as typeof fetch,
      hasPermission,
    });
    const result = await provider.complete({
      tool: "translate_incoming",
      prompt: "ping",
      model: "phi-4",
    });
    expect(result.text).toBe('{"ok":true}');
    expect(hasPermission).toHaveBeenCalledTimes(1);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to JSON parsing when the response is not an event stream", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(200, {
        choices: [{ message: { content: '{"ok":true}' } }],
      }),
    ) as unknown as typeof fetch;

    const provider = createLMStudioProvider({
      baseUrl: LMSTUDIO_DEFAULT_BASE_URL,
      fetchImpl: fakeFetch,
    });

    const tokens: string[] = [];
    const result = await provider.complete({
      tool: "translate_incoming",
      prompt: "ping",
      model: "llama-3.1-8b",
      onToken: (t) => tokens.push(t),
    });
    expect(result.text).toBe('{"ok":true}');
    expect(tokens).toEqual(['{"ok":true}']);
  });
});

describe("fetchLMStudioModels", () => {
  it("returns the data[].id array on a happy 200", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(200, {
        data: [
          { id: "qwen2.5-7b-instruct" },
          { id: "llama-3.1-8b" },
          { id: "phi-4" },
        ],
      }),
    ) as unknown as typeof fetch;

    const models = await fetchLMStudioModels({
      baseUrl: LMSTUDIO_DEFAULT_BASE_URL,
      fetchImpl: fakeFetch,
    });
    expect(models).toEqual(["qwen2.5-7b-instruct", "llama-3.1-8b", "phi-4"]);
  });

  it("returns an empty array when LM Studio has no model loaded", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(200, { data: [] }),
    ) as unknown as typeof fetch;

    const models = await fetchLMStudioModels({
      baseUrl: LMSTUDIO_DEFAULT_BASE_URL,
      fetchImpl: fakeFetch,
    });
    expect(models).toEqual([]);
  });

  it("throws LMSTUDIO_UNREACHABLE when fetch rejects", async () => {
    const fakeFetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    let err: unknown;
    try {
      await fetchLMStudioModels({
        baseUrl: LMSTUDIO_DEFAULT_BASE_URL,
        fetchImpl: fakeFetch,
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(/LMSTUDIO_UNREACHABLE/);
  });

  it("throws LMSTUDIO_PERMISSION_REQUIRED when hasPermission returns false (v0.0.4)", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(200, { data: [{ id: "phi-4" }] }),
    ) as unknown as typeof fetch;
    const hasPermission = vi.fn(async () => false);
    let err: unknown;
    try {
      await fetchLMStudioModels({
        baseUrl: "http://169.254.83.107:1234/v1",
        fetchImpl: fakeFetch,
        hasPermission,
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(/LMSTUDIO_PERMISSION_REQUIRED/);
  });

  it("forwards the bearer token when apiKey is provided", async () => {
    const captured: CapturedRequest[] = [];
    const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      captured.push({ url, init });
      return buildJsonResponse(200, { data: [{ id: "phi-4" }] });
    }) as unknown as typeof fetch;

    await fetchLMStudioModels({
      baseUrl: LMSTUDIO_DEFAULT_BASE_URL,
      apiKey: "proxy-secret",
      fetchImpl: fakeFetch,
    });

    const headers = captured[0]?.init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer proxy-secret");
  });
});

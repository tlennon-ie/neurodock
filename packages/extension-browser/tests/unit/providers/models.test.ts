import { describe, it, expect, vi } from "vitest";
import {
  ANTHROPIC_KNOWN_MODELS,
  fetchModels,
  fetchOllamaModels,
  fetchOpenAIModels,
  fetchOpenRouterModels,
} from "../../../src/lib/providers/models.js";

function buildJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchOllamaModels", () => {
  it("flattens models[].name from /api/tags", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(200, {
        models: [
          { name: "llama3.2:3b" },
          { name: "qwen2.5:7b" },
          { model: "phi3:mini" }, // alternate key tolerated
        ],
      }),
    ) as unknown as typeof fetch;
    const models = await fetchOllamaModels({
      baseUrl: "http://localhost:11434",
      fetchImpl: fakeFetch,
    });
    expect(models).toEqual(["llama3.2:3b", "qwen2.5:7b", "phi3:mini"]);
  });

  it("returns [] when Ollama has no models loaded", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(200, { models: [] }),
    ) as unknown as typeof fetch;
    const models = await fetchOllamaModels({
      baseUrl: "http://localhost:11434",
      fetchImpl: fakeFetch,
    });
    expect(models).toEqual([]);
  });

  it("throws OLLAMA_UNREACHABLE when fetch rejects", async () => {
    const fakeFetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    let err: unknown;
    try {
      await fetchOllamaModels({
        baseUrl: "http://localhost:11434",
        fetchImpl: fakeFetch,
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(/OLLAMA_UNREACHABLE/);
  });
});

describe("fetchOpenAIModels", () => {
  it("returns chat-eligible model ids when the listing includes them", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(200, {
        data: [
          { id: "gpt-4o-mini" },
          { id: "gpt-4o" },
          { id: "text-embedding-3-small" },
          { id: "o1-preview" },
        ],
      }),
    ) as unknown as typeof fetch;
    const models = await fetchOpenAIModels({
      apiKey: "sk-test",
      fetchImpl: fakeFetch,
    });
    expect(models).toContain("gpt-4o-mini");
    expect(models).toContain("gpt-4o");
    expect(models).toContain("o1-preview");
    // Embedding model should be filtered out when chat models exist.
    expect(models).not.toContain("text-embedding-3-small");
  });

  it("throws OPENAI_AUTH_FAILED on a 401", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(401, { error: { message: "invalid key" } }),
    ) as unknown as typeof fetch;
    let err: unknown;
    try {
      await fetchOpenAIModels({
        apiKey: "sk-bad",
        fetchImpl: fakeFetch,
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(/OPENAI_AUTH_FAILED/);
  });

  it("refuses to fetch when apiKey is empty", async () => {
    let err: unknown;
    try {
      await fetchOpenAIModels({ apiKey: "" });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(/OPENAI_API_KEY_MISSING/);
  });

  it("returns [] when OpenAI returns an empty data array", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(200, { data: [] }),
    ) as unknown as typeof fetch;
    const models = await fetchOpenAIModels({
      apiKey: "sk-test",
      fetchImpl: fakeFetch,
    });
    expect(models).toEqual([]);
  });
});

describe("fetchOpenRouterModels", () => {
  it("always prepends openrouter/auto, even if absent from the response", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(200, {
        data: [
          { id: "anthropic/claude-3-5-sonnet" },
          { id: "meta-llama/llama-3.3-70b-instruct" },
        ],
      }),
    ) as unknown as typeof fetch;
    const models = await fetchOpenRouterModels({
      apiKey: "sk-or-test",
      fetchImpl: fakeFetch,
    });
    expect(models[0]).toBe("openrouter/auto");
    expect(models).toContain("anthropic/claude-3-5-sonnet");
    expect(models).toContain("meta-llama/llama-3.3-70b-instruct");
  });

  it("does not duplicate openrouter/auto if already in the listing", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(200, {
        data: [
          { id: "openrouter/auto" },
          { id: "anthropic/claude-3-5-sonnet" },
        ],
      }),
    ) as unknown as typeof fetch;
    const models = await fetchOpenRouterModels({
      apiKey: "sk-or-test",
      fetchImpl: fakeFetch,
    });
    expect(models.filter((m) => m === "openrouter/auto").length).toBe(1);
    expect(models[0]).toBe("openrouter/auto");
  });

  it("throws OPENROUTER_AUTH_FAILED on a 401", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(401, { error: { message: "invalid key" } }),
    ) as unknown as typeof fetch;
    let err: unknown;
    try {
      await fetchOpenRouterModels({
        apiKey: "sk-or-bad",
        fetchImpl: fakeFetch,
      });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(/OPENROUTER_AUTH_FAILED/);
  });

  it("refuses to fetch when apiKey is empty", async () => {
    let err: unknown;
    try {
      await fetchOpenRouterModels({ apiKey: "" });
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(/OPENROUTER_API_KEY_MISSING/);
  });
});

describe("fetchModels dispatch", () => {
  it("returns the hardcoded Anthropic list without making any network call", async () => {
    const fakeFetch = vi.fn() as unknown as typeof fetch;
    const models = await fetchModels({
      provider: "anthropic",
      fetchImpl: fakeFetch,
    });
    expect(models).toEqual([...ANTHROPIC_KNOWN_MODELS]);
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("dispatches Ollama through fetchOllamaModels", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(200, { models: [{ name: "phi3:mini" }] }),
    ) as unknown as typeof fetch;
    const models = await fetchModels({
      provider: "ollama",
      baseUrl: "http://localhost:11434",
      fetchImpl: fakeFetch,
    });
    expect(models).toEqual(["phi3:mini"]);
  });

  it("dispatches LM Studio through fetchLMStudioModels", async () => {
    const fakeFetch = vi.fn(async () =>
      buildJsonResponse(200, { data: [{ id: "qwen2.5-7b-instruct" }] }),
    ) as unknown as typeof fetch;
    const models = await fetchModels({
      provider: "lmstudio",
      baseUrl: "http://localhost:1234/v1",
      fetchImpl: fakeFetch,
    });
    expect(models).toEqual(["qwen2.5-7b-instruct"]);
  });
});

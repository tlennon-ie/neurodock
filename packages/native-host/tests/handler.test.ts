import { describe, it, expect } from "vitest";
import {
  handleRequest,
  isTrivialChange,
  type ProfileIoAdapter,
} from "../src/handler.js";

const VALID_PROFILE = {
  identity: { display_name: "T", neurotypes: ["adhd"] },
} as const;

interface FakeStore {
  readonly path: string;
  raw: unknown;
  exists: boolean;
}

function makeIo(store: FakeStore): ProfileIoAdapter {
  return {
    resolvePath: () => store.path,
    read: () => ({ exists: store.exists, raw: store.raw, text: "" }),
    write: (_path, value) => {
      store.exists = true;
      store.raw = value;
      return { created: false, bytesWritten: JSON.stringify(value).length };
    },
  };
}

describe("handler", () => {
  it("responds to ping with version metadata", () => {
    const store: FakeStore = {
      path: "/tmp/profile.yaml",
      raw: null,
      exists: false,
    };
    const r = handleRequest({ op: "ping", id: "1" }, makeIo(store));
    expect(r.ok).toBe(true);
    expect(r.op).toBe("ping");
    expect(r.id).toBe("1");
  });

  it("rejects a payload that does not match the request shape", () => {
    const store: FakeStore = {
      path: "/tmp/profile.yaml",
      raw: null,
      exists: false,
    };
    const r = handleRequest({ verb: "ping" }, makeIo(store));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/BAD_REQUEST/);
  });

  it("get returns the stored profile when present", () => {
    const store: FakeStore = {
      path: "/tmp/profile.yaml",
      raw: VALID_PROFILE,
      exists: true,
    };
    const r = handleRequest({ op: "get" }, makeIo(store));
    expect(r.ok).toBe(true);
    const data = r.data as { exists: boolean; profile: unknown };
    expect(data.exists).toBe(true);
    expect(data.profile).toEqual(VALID_PROFILE);
  });

  it("get reports exists:false when the file is missing", () => {
    const store: FakeStore = {
      path: "/tmp/profile.yaml",
      raw: null,
      exists: false,
    };
    const r = handleRequest({ op: "get" }, makeIo(store));
    expect(r.ok).toBe(true);
    const data = r.data as { exists: boolean };
    expect(data.exists).toBe(false);
  });

  it("set rejects a payload that fails schema validation", () => {
    const store: FakeStore = {
      path: "/tmp/profile.yaml",
      raw: null,
      exists: false,
    };
    const r = handleRequest(
      { op: "set", payload: { identity: { neurotypes: ["adhd"] } } },
      makeIo(store),
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/SCHEMA_INVALID/);
  });

  it("set writes a valid profile when the file does not yet exist", () => {
    const store: FakeStore = {
      path: "/tmp/profile.yaml",
      raw: null,
      exists: false,
    };
    const r = handleRequest(
      { op: "set", payload: { ...VALID_PROFILE } },
      makeIo(store),
    );
    expect(r.ok).toBe(true);
    expect(store.raw).toEqual(VALID_PROFILE);
  });

  it("set refuses to clobber non-extension fields without confirmOverwrite", () => {
    const onDisk = {
      identity: { display_name: "T", neurotypes: ["adhd"] },
      privacy: { telemetry: "local_otel_only" },
    };
    const store: FakeStore = {
      path: "/tmp/profile.yaml",
      raw: onDisk,
      exists: true,
    };
    const r = handleRequest(
      {
        op: "set",
        payload: { identity: { display_name: "Alex", neurotypes: ["adhd"] } },
      },
      makeIo(store),
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/CONFIRM_REQUIRED/);
  });

  it("set proceeds when confirmOverwrite is true", () => {
    const onDisk = {
      identity: { display_name: "T", neurotypes: ["adhd"] },
      privacy: { telemetry: "local_otel_only" },
    };
    const store: FakeStore = {
      path: "/tmp/profile.yaml",
      raw: onDisk,
      exists: true,
    };
    const r = handleRequest(
      {
        op: "set",
        confirmOverwrite: true,
        payload: { identity: { display_name: "Alex", neurotypes: ["adhd"] } },
      },
      makeIo(store),
    );
    expect(r.ok).toBe(true);
  });

  it("isTrivialChange treats identity-only updates as trivial", () => {
    const existing = {
      identity: { display_name: "T", neurotypes: ["adhd"] },
    };
    const next = { identity: { display_name: "Alex", neurotypes: ["adhd"] } };
    expect(isTrivialChange(existing, next)).toBe(true);
  });

  it("isTrivialChange refuses when a non-extension top-level field would be dropped", () => {
    const existing = {
      identity: { display_name: "T", neurotypes: ["adhd"] },
      chronometric: { hyperfocus_break_minutes: 60 },
    };
    const next = { identity: { display_name: "Alex", neurotypes: ["adhd"] } };
    expect(isTrivialChange(existing, next)).toBe(false);
  });
});

/**
 * End-to-end protocol round trip. Feed encoded request frames into the
 * handler and assert the encoded response frame decodes back to the
 * expected shape. The stdio loop in src/index.ts is exercised by a real
 * install; here we cover the logic that loop wraps.
 */
import { describe, it, expect } from "vitest";
import {
  encodeMessage,
  tryDecodeMessage,
  type HostRequest,
  type HostResponse,
} from "../src/protocol.js";
import { handleRequest, type ProfileIoAdapter } from "../src/handler.js";

function roundTrip(io: ProfileIoAdapter, request: HostRequest): HostResponse {
  const frame = encodeMessage(request);
  const decoded = tryDecodeMessage(frame);
  if (!decoded) throw new Error("decode failed");
  const response = handleRequest(decoded.message, io);
  const responseFrame = encodeMessage(response);
  const back = tryDecodeMessage(responseFrame);
  if (!back) throw new Error("response decode failed");
  return back.message as HostResponse;
}

describe("native messaging round-trip", () => {
  it("get then set round-trips through encoded frames", () => {
    let stored: unknown = null;
    let exists = false;
    const io: ProfileIoAdapter = {
      resolvePath: () => "/tmp/profile.yaml",
      read: () => ({ exists, raw: stored, text: "" }),
      write: (_path, value) => {
        stored = value;
        exists = true;
        return { created: true, bytesWritten: JSON.stringify(value).length };
      },
    };

    const getEmpty = roundTrip(io, { op: "get", id: "1" });
    expect(getEmpty.ok).toBe(true);
    expect((getEmpty.data as { exists: boolean }).exists).toBe(false);

    const setResponse = roundTrip(io, {
      op: "set",
      id: "2",
      payload: { identity: { display_name: "T", neurotypes: ["adhd"] } },
    });
    expect(setResponse.ok).toBe(true);

    const getAfter = roundTrip(io, { op: "get", id: "3" });
    const data = getAfter.data as { exists: boolean; profile: unknown };
    expect(data.exists).toBe(true);
    expect(data.profile).toEqual({
      identity: { display_name: "T", neurotypes: ["adhd"] },
    });
  });

  it("rejects an unknown op while preserving the id correlation", () => {
    const io: ProfileIoAdapter = {
      resolvePath: () => "/tmp/profile.yaml",
      read: () => ({ exists: false, raw: null, text: "" }),
      write: () => ({ created: false, bytesWritten: 0 }),
    };
    const frame = encodeMessage({ op: "delete", id: "x" });
    const decoded = tryDecodeMessage(frame);
    const response = handleRequest(decoded!.message, io);
    expect(response.ok).toBe(false);
    expect(response.id).toBe("x");
    expect(response.error).toMatch(/BAD_REQUEST/);
  });
});

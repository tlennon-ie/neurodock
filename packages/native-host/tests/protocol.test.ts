import { describe, it, expect } from "vitest";
import {
  encodeMessage,
  tryDecodeMessage,
  isHostRequest,
  MAX_MESSAGE_BYTES,
  ProtocolError,
} from "../src/protocol.js";

describe("native messaging protocol", () => {
  it("round-trips a JSON message through the length-prefixed frame", () => {
    const payload = { op: "ping", id: "abc" };
    const frame = encodeMessage(payload);
    const step = tryDecodeMessage(frame);
    expect(step).not.toBeNull();
    expect(step?.message).toEqual(payload);
    expect(step?.rest.byteLength).toBe(0);
  });

  it("decodes multiple back-to-back frames from a single buffer", () => {
    const a = encodeMessage({ op: "ping" });
    const b = encodeMessage({ op: "get", id: "1" });
    const combined = Buffer.concat([a, b]);
    const first = tryDecodeMessage(combined);
    expect(first).not.toBeNull();
    expect(first?.message).toEqual({ op: "ping" });
    const second = tryDecodeMessage(first!.rest);
    expect(second?.message).toEqual({ op: "get", id: "1" });
    expect(second?.rest.byteLength).toBe(0);
  });

  it("returns null when fewer than 4 prefix bytes are available", () => {
    expect(tryDecodeMessage(Buffer.from([0x01, 0x02]))).toBeNull();
  });

  it("returns null when the payload is partially buffered", () => {
    const frame = encodeMessage({ op: "ping" });
    const truncated = frame.subarray(0, frame.byteLength - 2);
    expect(tryDecodeMessage(truncated)).toBeNull();
  });

  it("rejects an oversized announced length", () => {
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32LE(MAX_MESSAGE_BYTES + 1, 0);
    expect(() => tryDecodeMessage(prefix)).toThrow(ProtocolError);
  });

  it("rejects an oversized outgoing payload", () => {
    const big = "x".repeat(MAX_MESSAGE_BYTES + 1);
    expect(() => encodeMessage({ blob: big })).toThrow(ProtocolError);
  });

  it("rejects a malformed JSON body", () => {
    const body = Buffer.from("not-json", "utf8");
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32LE(body.byteLength, 0);
    expect(() => tryDecodeMessage(Buffer.concat([prefix, body]))).toThrow(ProtocolError);
  });

  it("isHostRequest accepts ping/get/set and rejects garbage", () => {
    expect(isHostRequest({ op: "ping" })).toBe(true);
    expect(isHostRequest({ op: "get", id: "x" })).toBe(true);
    expect(isHostRequest({ op: "set", payload: {} })).toBe(true);
    expect(isHostRequest({ op: "delete" })).toBe(false);
    expect(isHostRequest({})).toBe(false);
    expect(isHostRequest(null)).toBe(false);
    expect(isHostRequest({ op: "ping", id: 42 })).toBe(false);
  });
});

import { describe, expect, test } from "vitest";
import { version } from "./index";

describe("@neurodock/core", () => {
  test("exports a version constant", () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

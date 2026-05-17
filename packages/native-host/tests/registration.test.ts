import { describe, it, expect } from "vitest";
import {
  buildManifest,
  buildFirefoxManifest,
  HOST_NAME,
} from "../src/registration/types.js";

describe("manifest builders", () => {
  it("Chromium manifest declares stdio + allowed_origins as chrome-extension URLs", () => {
    const m = buildManifest({
      hostPath: "/usr/local/bin/neurodock-native-host",
      allowedExtensionIds: ["abc", "def"],
    });
    expect(m["name"]).toBe(HOST_NAME);
    expect(m["type"]).toBe("stdio");
    expect(m["path"]).toBe("/usr/local/bin/neurodock-native-host");
    expect(m["allowed_origins"]).toEqual([
      "chrome-extension://abc/",
      "chrome-extension://def/",
    ]);
  });

  it("Firefox manifest declares allowed_extensions as bare IDs", () => {
    const m = buildFirefoxManifest({
      hostPath: "/usr/local/bin/neurodock-native-host",
      allowedExtensionIds: ["addon@example.com"],
    });
    expect(m["allowed_extensions"]).toEqual(["addon@example.com"]);
    expect(m["type"]).toBe("stdio");
  });
});

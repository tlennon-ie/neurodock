import { describe, it, expect } from "vitest";
import {
  buildManifest,
  buildFirefoxManifest,
  HOST_NAME,
  PUBLISHED_EXTENSION_IDS,
  withDefaultExtensionIds,
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

describe("default allowed extension ids", () => {
  it("ships the published Chrome Web Store id and Firefox gecko id, not the old placeholder", () => {
    // The placeholder `__NEURODOCK_EXTENSION_ID__` was never substituted,
    // so allowed_origins matched no extension and native messaging was
    // refused for everyone. The real published ids replace it.
    expect(PUBLISHED_EXTENSION_IDS).toContain(
      "lcdaiekokkgniiknejddojkfkoiinopo",
    );
    expect(PUBLISHED_EXTENSION_IDS).toContain(
      "neurodock-extension@neurodock.org",
    );
    expect(PUBLISHED_EXTENSION_IDS).not.toContain("__NEURODOCK_EXTENSION_ID__");
  });

  it("withDefaultExtensionIds unions provided ids with the published defaults, deduped", () => {
    const out = withDefaultExtensionIds([
      "devunpackedid",
      "lcdaiekokkgniiknejddojkfkoiinopo",
    ]);
    expect(out).toContain("devunpackedid");
    expect(out).toContain("lcdaiekokkgniiknejddojkfkoiinopo");
    expect(out).toContain("neurodock-extension@neurodock.org");
    // No duplicate of the published id the caller also passed.
    expect(
      out.filter((id) => id === "lcdaiekokkgniiknejddojkfkoiinopo"),
    ).toHaveLength(1);
  });

  it("withDefaultExtensionIds returns just the published defaults when nothing extra is provided", () => {
    expect(withDefaultExtensionIds([])).toEqual([...PUBLISHED_EXTENSION_IDS]);
  });

  it("a Chrome manifest built from the defaults allows the published store id", () => {
    const m = buildManifest({
      hostPath: "/x",
      allowedExtensionIds: withDefaultExtensionIds([]),
    });
    expect(m["allowed_origins"]).toContain(
      "chrome-extension://lcdaiekokkgniiknejddojkfkoiinopo/",
    );
  });
});

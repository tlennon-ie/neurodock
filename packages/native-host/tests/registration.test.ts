import { describe, it, expect } from "vitest";
import {
  buildManifest,
  buildFirefoxManifest,
  HOST_NAME,
  PUBLISHED_EXTENSION_IDS,
  withDefaultExtensionIds,
  isChromiumExtensionId,
  isFirefoxExtensionId,
} from "../src/registration/types.js";

const CHROME_ID = "lcdaiekokkgniiknejddojkfkoiinopo";
const UNPACKED_CHROME_ID = "jjcjkmljfdebbefdemkcgknjplgkicen";
const GECKO_ID = "neurodock-extension@neurodock.org";
const UUID_GECKO_ID = "{d3b0a1c2-1234-4567-89ab-cdef01234567}";

describe("manifest builders", () => {
  it("Chromium manifest declares stdio + allowed_origins as chrome-extension URLs", () => {
    const m = buildManifest({
      hostPath: "/usr/local/bin/neurodock-native-host",
      allowedExtensionIds: [CHROME_ID, UNPACKED_CHROME_ID],
    });
    expect(m["name"]).toBe(HOST_NAME);
    expect(m["type"]).toBe("stdio");
    expect(m["path"]).toBe("/usr/local/bin/neurodock-native-host");
    expect(m["allowed_origins"]).toEqual([
      `chrome-extension://${CHROME_ID}/`,
      `chrome-extension://${UNPACKED_CHROME_ID}/`,
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

describe("per-browser id filtering (Chrome rejects a manifest with any malformed origin)", () => {
  it("excludes the firefox gecko id from the chromium allowed_origins", () => {
    const m = buildManifest({
      hostPath: "/x",
      allowedExtensionIds: [CHROME_ID, GECKO_ID, UNPACKED_CHROME_ID],
    });
    // The gecko id must NOT appear as a chrome-extension origin — that single
    // malformed entry is what made Chrome report "host not found".
    expect(m["allowed_origins"]).toEqual([
      `chrome-extension://${CHROME_ID}/`,
      `chrome-extension://${UNPACKED_CHROME_ID}/`,
    ]);
    expect(m["allowed_origins"]).not.toContain(
      `chrome-extension://${GECKO_ID}/`,
    );
  });

  it("keeps only gecko ids in the firefox allowed_extensions", () => {
    const m = buildFirefoxManifest({
      hostPath: "/x",
      allowedExtensionIds: [
        CHROME_ID,
        GECKO_ID,
        UUID_GECKO_ID,
        UNPACKED_CHROME_ID,
      ],
    });
    expect(m["allowed_extensions"]).toEqual([GECKO_ID, UUID_GECKO_ID]);
  });

  it("classifies Chromium vs Firefox extension ids", () => {
    expect(isChromiumExtensionId(CHROME_ID)).toBe(true);
    expect(isChromiumExtensionId(UNPACKED_CHROME_ID)).toBe(true);
    expect(isChromiumExtensionId(GECKO_ID)).toBe(false);
    expect(isChromiumExtensionId("tooshort")).toBe(false);
    expect(isChromiumExtensionId(CHROME_ID.toUpperCase())).toBe(false);
    expect(isFirefoxExtensionId(GECKO_ID)).toBe(true);
    expect(isFirefoxExtensionId(UUID_GECKO_ID)).toBe(true);
    expect(isFirefoxExtensionId(CHROME_ID)).toBe(false);
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

  it("a Chrome manifest from the defaults allows the published store id but NOT the gecko id", () => {
    const m = buildManifest({
      hostPath: "/x",
      allowedExtensionIds: withDefaultExtensionIds([]),
    });
    expect(m["allowed_origins"]).toContain(
      "chrome-extension://lcdaiekokkgniiknejddojkfkoiinopo/",
    );
    // Regression guard for the connectivity bug: the gecko id must never reach
    // a chrome-extension origin (Chrome would reject the whole manifest).
    expect(m["allowed_origins"]).not.toContain(
      "chrome-extension://neurodock-extension@neurodock.org/",
    );
  });
});

/**
 * Focused unit tests for detectChannelFromUrl (H2 security hardening).
 *
 * Prior to 2026-05-27 the function used `url.includes()` which allowed
 * spoofed URLs such as:
 *   - https://evil.com/redirect?u=mail.google.com  (query-string spoof)
 *   - https://mail.google.com.evil.com/            (subdomain spoof)
 *
 * The hardened version parses the URL and matches on hostname only.
 * These tests pin that contract.
 *
 * CodeQL alerts #28-29.
 */
import { describe, it, expect } from "vitest";
import { detectChannelFromUrl } from "../../src/lib/translation-client.js";

describe("detectChannelFromUrl — happy paths", () => {
  it("recognises mail.google.com as email", () => {
    expect(detectChannelFromUrl("https://mail.google.com/u/0/")).toBe("email");
  });

  it("recognises app.slack.com as slack", () => {
    expect(detectChannelFromUrl("https://app.slack.com/client/T0/C0")).toBe(
      "slack",
    );
  });

  it("recognises github.com as github", () => {
    expect(detectChannelFromUrl("https://github.com/org/repo/pull/1")).toBe(
      "github",
    );
  });

  it("recognises docs.google.com as gdocs", () => {
    expect(
      detectChannelFromUrl("https://docs.google.com/document/d/abc/edit"),
    ).toBe("gdocs");
  });

  it("returns generic for an unrecognised host", () => {
    expect(detectChannelFromUrl("https://example.com/some/path")).toBe(
      "generic",
    );
  });
});

describe("detectChannelFromUrl — spoof rejection (H2)", () => {
  it("rejects query-string spoof: mail.google.com in query param", () => {
    expect(
      detectChannelFromUrl("https://evil.com/redirect?to=mail.google.com"),
    ).toBe("generic");
  });

  it("rejects subdomain-suffix spoof: mail.google.com.attacker.com", () => {
    expect(
      detectChannelFromUrl("https://mail.google.com.attacker.com/path"),
    ).toBe("generic");
  });

  it("rejects path spoof: mail.google.com in path segment", () => {
    expect(
      detectChannelFromUrl("https://attacker.com/phish/mail.google.com/"),
    ).toBe("generic");
  });

  it("rejects fragment spoof: mail.google.com in fragment", () => {
    expect(detectChannelFromUrl("https://attacker.com/#mail.google.com")).toBe(
      "generic",
    );
  });
});

describe("detectChannelFromUrl — edge cases", () => {
  it("returns generic for an unparseable URL string", () => {
    // URL constructor throws for strings that are not valid URLs.
    expect(detectChannelFromUrl("https://invalid-url")).toBe("generic");
    expect(detectChannelFromUrl("not a url at all")).toBe("generic");
    expect(detectChannelFromUrl("")).toBe("generic");
  });

  it("matches a legitimate mail.google.com subdomain as email", () => {
    // e.g. mail-archive.mail.google.com is a real Google property
    expect(detectChannelFromUrl("https://mail-archive.mail.google.com/")).toBe(
      "email",
    );
  });

  it("matches a github.com subdomain as github", () => {
    // enterprise.github.com, gist.github.com, etc.
    expect(
      detectChannelFromUrl("https://enterprise.github.com/orgs/my-org"),
    ).toBe("github");
  });

  it("matches a notion.so subdomain as notion", () => {
    expect(detectChannelFromUrl("https://team.notion.so/My-Page-abc123")).toBe(
      "notion",
    );
  });

  it("recognises all three Outlook hostnames as email", () => {
    expect(detectChannelFromUrl("https://outlook.live.com/mail/0/")).toBe(
      "email",
    );
    expect(detectChannelFromUrl("https://outlook.office.com/mail/")).toBe(
      "email",
    );
    expect(detectChannelFromUrl("https://outlook.office365.com/mail/")).toBe(
      "email",
    );
  });

  it("does NOT match an outlook hostname that is not in the explicit list", () => {
    // The old `url.includes("outlook.")` matched anything containing
    // "outlook." — the hardened version does not.
    expect(detectChannelFromUrl("https://myoutlook.example.com/")).toBe(
      "generic",
    );
  });
});

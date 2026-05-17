// Public interfaces shared across the CLI.

export type Platform = "darwin" | "linux" | "win32";

export type ClientId = "claude-desktop" | "claude-code" | "cursor";

export interface ClientLocation {
  readonly id: ClientId;
  readonly path: string;
  readonly scope: "user" | "project";
}

export interface DetectedClient extends ClientLocation {
  readonly exists: boolean;
}

export interface McpServerEntry {
  readonly command: string;
  readonly args?: ReadonlyArray<string>;
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
}

export interface McpClientConfig {
  readonly mcpServers?: Readonly<Record<string, McpServerEntry>>;
  readonly [extra: string]: unknown;
}

export interface InitOptions {
  readonly client: ClientId | "all";
  readonly profile: "minimal" | "example";
  readonly dryRun: boolean;
  readonly yes: boolean;
}

export interface InitDiff {
  readonly profileAction: "create" | "exists" | "skipped";
  readonly profilePath: string;
  readonly clients: ReadonlyArray<ClientDiff>;
}

export interface ClientDiff {
  readonly client: ClientId;
  readonly path: string;
  readonly action: "create" | "update" | "skip" | "no-change";
  readonly added: ReadonlyArray<string>;
  readonly collisions: ReadonlyArray<string>;
  readonly reason?: string;
}

export type CheckStatus = "PASS" | "FAIL" | "SKIP";

export interface CheckResult {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail?: string;
}

export interface ProfileEnvelope {
  readonly raw: unknown;
  readonly resolved: unknown;
  readonly errors: ReadonlyArray<string>;
}

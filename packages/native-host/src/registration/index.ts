/**
 * Platform-dispatching registration entry point used by `neurodock host install`
 * and the bin `neurodock-native-host install`.
 */
import { platform } from "node:os";
import { registerDarwin, unregisterDarwin } from "./darwin.js";
import { registerLinux, unregisterLinux } from "./linux.js";
import { registerWindows, unregisterWindows } from "./windows.js";
import type {
  RegistrationOptions,
  RegistrationOutcome,
  UnregisterOptions,
} from "./types.js";

export type SupportedPlatform = "darwin" | "linux" | "win32";

export function detectPlatform(): SupportedPlatform | "unsupported" {
  const p = platform();
  if (p === "darwin" || p === "linux" || p === "win32") return p;
  return "unsupported";
}

export function register(
  opts: RegistrationOptions,
): ReadonlyArray<RegistrationOutcome> {
  const p = detectPlatform();
  switch (p) {
    case "darwin":
      return registerDarwin(opts);
    case "linux":
      return registerLinux(opts);
    case "win32":
      return registerWindows(opts);
    default:
      return [
        {
          browser: "unsupported",
          manifestPath: "",
          action: "skip",
          detail: `Platform ${platform()} is not supported. Open an issue if you need this.`,
        },
      ];
  }
}

export function unregister(
  opts: UnregisterOptions = {},
): ReadonlyArray<RegistrationOutcome> {
  const p = detectPlatform();
  switch (p) {
    case "darwin":
      return unregisterDarwin(opts);
    case "linux":
      return unregisterLinux(opts);
    case "win32":
      return unregisterWindows(opts);
    default:
      return [
        {
          browser: "unsupported",
          manifestPath: "",
          action: "skip",
          detail: `Platform ${platform()} is not supported.`,
        },
      ];
  }
}

export type {
  RegistrationOptions,
  RegistrationOutcome,
  UnregisterOptions,
} from "./types.js";
export { HOST_NAME } from "./types.js";

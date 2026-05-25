/**
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Atomic file-write helpers that prevent TOCTOU (time-of-check/time-of-use)
 * races between an `existsSync` check and a subsequent `writeFileSync`.
 *
 * Two strategies:
 *
 *  - `atomicWriteNew`  — create a file that MUST NOT already exist.
 *    Opens with O_CREAT | O_EXCL so a concurrent creator loses safely.
 *
 *  - `atomicWriteOverwrite` — create-or-replace a file atomically.
 *    Writes to a `.pid.ts.tmp` sibling and renames it into place.
 *    Rename is atomic on POSIX; on Windows it is best-effort
 *    (fs.renameSync replaces the target when it can).
 */
import {
  openSync,
  writeSync,
  closeSync,
  writeFileSync,
  renameSync,
  constants,
} from "node:fs";

/**
 * Atomically create a new file with `content`.
 * Throws if the file already exists (mirrors O_EXCL semantics).
 */
export function atomicWriteNew(filePath: string, content: string): void {
  const fd = openSync(
    filePath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    0o644,
  );
  try {
    writeSync(fd, content);
  } finally {
    closeSync(fd);
  }
}

/**
 * Atomically overwrite (or create) `filePath` with `content`.
 * Writes to a unique temp sibling then renames it into place.
 */
export function atomicWriteOverwrite(filePath: string, content: string): void {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, content, { mode: 0o644 });
  renameSync(tmpPath, filePath);
}

/**
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Atomic file-write helpers — see packages/cli/src/util/atomic-write.ts
 * for the canonical explanation.  This copy exists so native-host has no
 * dependency on the CLI package.
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
 * Atomically create a new file. Throws (EEXIST) if the file already exists.
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

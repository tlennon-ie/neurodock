/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import * as nativeHost from "../../src/lib/native-host-client.js";
import {
  PowerUpCard,
  FULL_SETUP_COMMAND,
} from "../../src/components/PowerUpCard.js";

afterEach(() => vi.restoreAllMocks());

describe("PowerUpCard", () => {
  it("shows the one-command setup and the command string when not connected", async () => {
    vi.spyOn(nativeHost, "probeNativeHost").mockResolvedValue({
      status: "absent",
    });
    render(<PowerUpCard />);
    await waitFor(() =>
      expect(screen.getByTestId("power-up-command")).toHaveTextContent(
        FULL_SETUP_COMMAND,
      ),
    );
    expect(screen.getByTestId("power-up-status")).toHaveTextContent(
      /not connected/i,
    );
  });

  it("shows Connected when the host is active", async () => {
    vi.spyOn(nativeHost, "probeNativeHost").mockResolvedValue({
      status: "active",
      version: "0.1.0",
    });
    render(<PowerUpCard />);
    await waitFor(() =>
      expect(screen.getByTestId("power-up-status")).toHaveTextContent(
        /connected/i,
      ),
    );
  });
});

// Loader-applied defaults per ADR 0004 §15. The schema declares these as
// `default` values, but JSON Schema validation does not apply defaults — the
// loader must. Keep this table in sync with profile.schema.json.

export interface ProfileDefaults {
  readonly preferences: {
    readonly output_format: string;
    readonly max_chunk_size: number;
    readonly reading_font_hint: string;
    readonly motion: string;
  };
  readonly chronometric: {
    readonly hyperfocus_break_minutes: number;
    readonly session_overlap_policy: string;
  };
  readonly guardrails: {
    readonly rumination_threshold: number;
    readonly rumination_window_minutes: number;
    readonly sycophancy_check: string;
  };
  readonly privacy: {
    readonly embeddings: string;
    readonly telemetry: string;
    readonly os_idle_consent: boolean;
  };
}

export const PROFILE_DEFAULTS: ProfileDefaults = {
  preferences: {
    output_format: "answer_first",
    max_chunk_size: 7,
    reading_font_hint: "atkinson_hyperlegible",
    motion: "reduced",
  },
  chronometric: {
    hyperfocus_break_minutes: 90,
    session_overlap_policy: "auto_close",
  },
  guardrails: {
    rumination_threshold: 3,
    rumination_window_minutes: 90,
    sycophancy_check: "warn",
  },
  privacy: {
    embeddings: "local",
    telemetry: "off",
    os_idle_consent: false,
  },
};

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/**
 * Returns a NEW object — never mutates input. Applies defaults only when a
 * field is absent. Unknown keys at every level are preserved.
 */
export function applyDefaults(raw: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = isObject(raw) ? { ...raw } : {};

  out["preferences"] = mergeBlock(
    out["preferences"],
    PROFILE_DEFAULTS.preferences,
  );
  out["chronometric"] = mergeBlock(
    out["chronometric"],
    PROFILE_DEFAULTS.chronometric,
  );
  out["guardrails"] = mergeBlock(
    out["guardrails"],
    PROFILE_DEFAULTS.guardrails,
  );
  out["privacy"] = mergeBlock(out["privacy"], PROFILE_DEFAULTS.privacy);

  return out;
}

function mergeBlock(
  existing: unknown,
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  const base: Record<string, unknown> = isObject(existing)
    ? { ...existing }
    : {};
  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in base) || base[key] === undefined || base[key] === null) {
      base[key] = value;
    }
  }
  return base;
}

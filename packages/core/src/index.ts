/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
export const version = "0.2.0";

export type {
  Profile,
  ProfileIdentity,
  ProfilePreferences,
  ProfileChronometric,
  ProfileGuardrails,
  ProfilePrivacy,
  WeekdayOverride,
  ProtectedWindow,
  Neurotype,
  OutputFormat,
  ReadingFontHint,
  Motion,
  LineHeightHint,
  SessionOverlapPolicy,
  CalendarPhase,
  SycophancyCheck,
  Embeddings,
  Telemetry,
  Weekday,
} from "./profile.js";

export {
  assembleNeurotypeAddendum,
  neurotypeAddendaV1,
} from "./neurotype-addenda.js";

export type {
  NeurotypeAddendaArtifact,
  AddendumBlock,
  AddendumFusion,
  AddendumFraming,
  AddendumOutputFormat,
  AddendumSingleBlock,
  AssembleNeurotypeAddendumOptions,
} from "./neurotype-addenda.js";

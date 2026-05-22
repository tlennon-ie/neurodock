#!/usr/bin/env bash
# version-impact.sh — deterministic PR version-impact assessment.
#
# Reads `git diff $BASE_REF...HEAD --name-only`, maps changed files to
# their owning workspace package, classifies the change kind, checks
# version bumps + CHANGELOG entries + stale doc references, and prints
# a markdown report.
#
# Used by:
#   - The `.claude/skills/version-impact/SKILL.md` skill (local pre-flight)
#   - The `.github/workflows/pr-version-check.yml` CI workflow (advisory
#     sticky PR comment)
#
# Dependencies: git, grep, sed, awk, jq (for JSON parsing).
# Output: markdown to stdout. FORMAT=json switches to a JSON-shaped
# stdout for piping into other tooling. The script never fails the CI
# build for a "needs bump" finding — it only emits a non-zero exit when
# it cannot run at all (missing git, bad base ref, etc.).
#
# Environment:
#   BASE_REF   — diff base, default `origin/main`
#   HEAD_REF   — head ref, default `HEAD`
#   FORMAT     — `markdown` (default) or `json`
#   REPO_ROOT  — repo root, default `$(git rev-parse --show-toplevel)`

set -euo pipefail

BASE_REF="${BASE_REF:-origin/main}"
HEAD_REF="${HEAD_REF:-HEAD}"
FORMAT="${FORMAT:-markdown}"

if ! command -v git >/dev/null 2>&1; then
  echo "version-impact: git not found on PATH" >&2
  exit 2
fi

REPO_ROOT="${REPO_ROOT:-$(git rev-parse --show-toplevel)}"
cd "$REPO_ROOT"

# Verify the base ref exists locally. If it doesn't, fall back to the
# merge-base of HEAD with whatever ref the user passed in — useful in
# CI where `origin/main` is sometimes shallow.
if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  if git rev-parse --verify "main" >/dev/null 2>&1; then
    BASE_REF="main"
  else
    echo "version-impact: base ref '$BASE_REF' not found" >&2
    exit 2
  fi
fi

# -----------------------------------------------------------------
# 1. Collect changed files
# -----------------------------------------------------------------
mapfile -t CHANGED_FILES < <(git diff --name-only "$BASE_REF...$HEAD_REF" 2>/dev/null || true)

if [ "${#CHANGED_FILES[@]}" -eq 0 ]; then
  if [ "$FORMAT" = "json" ]; then
    printf '{"base_ref":"%s","head_ref":"%s","touched_packages":[],"notes":["no changes detected"]}\n' "$BASE_REF" "$HEAD_REF"
  else
    cat <<EOF
<!-- pr-version-check -->
# Version impact

No changes detected against \`$BASE_REF\`. Nothing to assess.
EOF
  fi
  exit 0
fi

# -----------------------------------------------------------------
# 2. Map files to packages
# -----------------------------------------------------------------
# Each entry in PKG_DIR_LIST is "<dir>|<pkg-name>|<manifest>|<publish-target>".
# manifest is `package.json` or `pyproject.toml`. publish-target is
# `npm`, `pypi`, `private`, or `none` (skill bundles, plugins, profiles, etc.).
PKG_DIR_LIST=(
  "packages/cli|@neurodock/cli|package.json|npm"
  "packages/core|@neurodock/core|package.json|npm"
  "packages/native-host|@neurodock/native-host|package.json|npm"
  "packages/extension-browser|@neurodock/extension-browser|package.json|private"
  "packages/mcp-chronometric|neurodock-mcp-chronometric|pyproject.toml|pypi"
  "packages/mcp-cognitive-graph|neurodock-mcp-cognitive-graph|pyproject.toml|pypi"
  "packages/mcp-guardrail|neurodock-mcp-guardrail|pyproject.toml|pypi"
  "packages/mcp-task-fractionator|neurodock-mcp-task-fractionator|pyproject.toml|pypi"
  "packages/mcp-translation|neurodock-mcp-translation|pyproject.toml|pypi"
  "packages/clinical|neurodock-clinical|pyproject.toml|pypi"
  "packages/evals|neurodock-evals|pyproject.toml|pypi"
)

# Helper: read JSON .version with jq, or fall back to a sed match.
read_json_version() {
  local file="$1"
  if [ ! -f "$file" ]; then echo ""; return; fi
  if command -v jq >/dev/null 2>&1; then
    jq -r '.version // ""' "$file" 2>/dev/null || true
  else
    sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$file" | head -1
  fi
}

read_toml_version() {
  local file="$1"
  if [ ! -f "$file" ]; then echo ""; return; fi
  # Grab the first top-level `version = "x.y.z"` under [project].
  awk '
    /^\[project\]/ { in_p=1; next }
    /^\[/ { in_p=0 }
    in_p && /^version[[:space:]]*=/ {
      gsub(/^version[[:space:]]*=[[:space:]]*"/, "")
      gsub(/".*$/, "")
      print
      exit
    }
  ' "$file"
}

# Read a file at a specific git ref (returns empty on missing).
git_show_or_empty() {
  local ref="$1"; local path="$2"
  git show "$ref:$path" 2>/dev/null || true
}

# Helper: extract version from a manifest blob read via git show.
extract_json_version_from_blob() {
  local blob="$1"
  if [ -z "$blob" ]; then echo ""; return; fi
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$blob" | jq -r '.version // ""' 2>/dev/null || true
  else
    printf '%s' "$blob" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1
  fi
}

extract_toml_version_from_blob() {
  local blob="$1"
  if [ -z "$blob" ]; then echo ""; return; fi
  printf '%s' "$blob" | awk '
    /^\[project\]/ { in_p=1; next }
    /^\[/ { in_p=0 }
    in_p && /^version[[:space:]]*=/ {
      gsub(/^version[[:space:]]*=[[:space:]]*"/, "")
      gsub(/".*$/, "")
      print
      exit
    }
  '
}

# -----------------------------------------------------------------
# 3. Per-package classification
# -----------------------------------------------------------------

# Recommend a bump kind given the set of changed files inside a package.
classify_changes() {
  local pkg_dir="$1"; shift
  local files=("$@")
  local has_major=0 has_minor=0 has_patch=0 has_none_only=1
  local f rel
  for f in "${files[@]}"; do
    rel="${f#"$pkg_dir/"}"
    # Skip nothing-changes patterns.
    case "$rel" in
      tests/*|*/tests/*|*.test.ts|*.spec.ts|test_*.py|*_test.py|pytest.ini|vitest.config.*|tsconfig*.json|CHANGELOG.md|README.md)
        continue
        ;;
    esac
    has_none_only=0
    # major-leaning: schema deletions/renames, command removals.
    case "$rel" in
      schemas/*|*/schemas/*)
        # Conservative: any schema change is at least minor; assume
        # major if it looks like a removal (file deleted in diff).
        has_minor=1
        ;;
      src/commands/*|*/src/commands/*)
        has_minor=1
        ;;
      src/tools/*|*/src/tools/*)
        has_minor=1
        ;;
      src/server.py|*/src/server.py|src/index.ts|*/src/index.ts)
        has_patch=1
        ;;
      src/*|*/src/*)
        has_patch=1
        ;;
      pyproject.toml|package.json)
        # Manifest-only is patch-ish; the real signal is whether the
        # version field changed (handled elsewhere).
        has_patch=1
        ;;
      *)
        has_patch=1
        ;;
    esac
  done
  # Detect deletions inside the package — those upgrade minor → major.
  local deleted
  deleted=$(git diff --name-only --diff-filter=D "$BASE_REF...$HEAD_REF" -- "$pkg_dir" 2>/dev/null || true)
  if [ -n "$deleted" ]; then
    while IFS= read -r d; do
      [ -z "$d" ] && continue
      case "$d" in
        *src/commands/*|*src/tools/*|*schemas/*)
          has_major=1
          ;;
      esac
    done <<< "$deleted"
  fi
  if [ "$has_major" = "1" ]; then echo "major"
  elif [ "$has_minor" = "1" ]; then echo "minor"
  elif [ "$has_patch" = "1" ]; then echo "patch"
  elif [ "$has_none_only" = "1" ]; then echo "none"
  else echo "patch"
  fi
}

# Semver-bump helpers.
bump_version() {
  local version="$1"; local kind="$2"
  IFS='.' read -r MA MI PA <<< "$version"
  MA="${MA:-0}"; MI="${MI:-0}"; PA="${PA:-0}"
  # Strip any pre-release tag from PA.
  PA="${PA%%-*}"
  case "$kind" in
    major) echo "$((MA+1)).0.0" ;;
    minor) echo "${MA}.$((MI+1)).0" ;;
    patch) echo "${MA}.${MI}.$((PA+1))" ;;
    none|*) echo "$version" ;;
  esac
}

# Compare two semver-ish strings; print -1/0/1 like a comparator.
semver_cmp() {
  local a="$1"; local b="$2"
  IFS='.' read -r A1 A2 A3 <<< "$a"
  IFS='.' read -r B1 B2 B3 <<< "$b"
  A1="${A1:-0}"; A2="${A2:-0}"; A3="${A3:-0}"
  B1="${B1:-0}"; B2="${B2:-0}"; B3="${B3:-0}"
  A3="${A3%%-*}"; B3="${B3%%-*}"
  if [ "$A1" -lt "$B1" ]; then echo -1; return; fi
  if [ "$A1" -gt "$B1" ]; then echo 1;  return; fi
  if [ "$A2" -lt "$B2" ]; then echo -1; return; fi
  if [ "$A2" -gt "$B2" ]; then echo 1;  return; fi
  if [ "$A3" -lt "$B3" ]; then echo -1; return; fi
  if [ "$A3" -gt "$B3" ]; then echo 1;  return; fi
  echo 0
}

# Classify the actual delta between two versions as major/minor/patch/none.
actual_bump_kind() {
  local before="$1"; local after="$2"
  if [ "$before" = "$after" ]; then echo "none"; return; fi
  IFS='.' read -r B1 B2 B3 <<< "$before"
  IFS='.' read -r A1 A2 A3 <<< "$after"
  B1="${B1:-0}"; B2="${B2:-0}"; B3="${B3:-0}"
  A1="${A1:-0}"; A2="${A2:-0}"; A3="${A3:-0}"
  if [ "$A1" != "$B1" ]; then echo "major"
  elif [ "$A2" != "$B2" ]; then echo "minor"
  else echo "patch"
  fi
}

# Map kind to numeric rank for comparison.
kind_rank() {
  case "$1" in
    none)  echo 0 ;;
    patch) echo 1 ;;
    minor) echo 2 ;;
    major) echo 3 ;;
    *)     echo 0 ;;
  esac
}

# -----------------------------------------------------------------
# 4. Walk packages, build report data
# -----------------------------------------------------------------

# Accumulators (parallel arrays).
RESULT_PKG=()
RESULT_FILES=()
RESULT_RECOMMENDED=()
RESULT_CURRENT=()
RESULT_SUGGESTED=()
RESULT_STATUS=()
RESULT_CHANGELOG_OK=()
RESULT_PUBLISH=()

NON_PKG_NOTES=()
SKILL_BUNDLE_NOTES=()
PLUGIN_NOTES=()

# Helper: collect changed files inside a given prefix.
files_under() {
  local prefix="$1"
  local f
  for f in "${CHANGED_FILES[@]}"; do
    case "$f" in
      "$prefix"/*) printf '%s\n' "$f" ;;
    esac
  done
}

for entry in "${PKG_DIR_LIST[@]}"; do
  IFS='|' read -r PKG_DIR PKG_NAME MANIFEST PUBLISH <<< "$entry"
  mapfile -t pkg_files < <(files_under "$PKG_DIR")
  if [ "${#pkg_files[@]}" -eq 0 ]; then continue; fi

  recommended=$(classify_changes "$PKG_DIR" "${pkg_files[@]}")
  if [ "$recommended" = "none" ]; then
    # Doc/test/tooling-only change — note it and skip strict checks.
    RESULT_PKG+=("$PKG_NAME")
    RESULT_FILES+=("${#pkg_files[@]}")
    RESULT_RECOMMENDED+=("$recommended")
    if [ "$MANIFEST" = "package.json" ]; then
      cur=$(read_json_version "$PKG_DIR/$MANIFEST")
    else
      cur=$(read_toml_version "$PKG_DIR/$MANIFEST")
    fi
    RESULT_CURRENT+=("$cur")
    RESULT_SUGGESTED+=("$cur")
    RESULT_STATUS+=("ok")
    RESULT_CHANGELOG_OK+=("n/a")
    RESULT_PUBLISH+=("$PUBLISH")
    continue
  fi

  # Read current and base versions of the manifest.
  if [ "$MANIFEST" = "package.json" ]; then
    cur=$(read_json_version "$PKG_DIR/$MANIFEST")
    base_blob=$(git_show_or_empty "$BASE_REF" "$PKG_DIR/$MANIFEST")
    base=$(extract_json_version_from_blob "$base_blob")
  else
    cur=$(read_toml_version "$PKG_DIR/$MANIFEST")
    base_blob=$(git_show_or_empty "$BASE_REF" "$PKG_DIR/$MANIFEST")
    base=$(extract_toml_version_from_blob "$base_blob")
  fi
  cur="${cur:-0.0.0}"; base="${base:-$cur}"

  suggested=$(bump_version "$base" "$recommended")
  actual_delta=$(actual_bump_kind "$base" "$cur")

  # Status logic.
  status="ok"
  if [ "$cur" = "$base" ]; then
    status="needs-bump"
  else
    rec_rank=$(kind_rank "$recommended")
    act_rank=$(kind_rank "$actual_delta")
    if [ "$act_rank" -lt "$rec_rank" ]; then
      status="bump-mismatch"
    fi
  fi

  # CHANGELOG check: only meaningful if the version was bumped.
  changelog_ok="n/a"
  if [ "$cur" != "$base" ]; then
    if [ -f "$PKG_DIR/CHANGELOG.md" ] && grep -qE "(^|[^0-9])${cur//./\\.}([^0-9]|$)" "$PKG_DIR/CHANGELOG.md"; then
      changelog_ok="yes"
    else
      changelog_ok="no"
      if [ "$status" = "ok" ] || [ "$status" = "bump-mismatch" ]; then
        status="missing-changelog"
      fi
    fi
  fi

  RESULT_PKG+=("$PKG_NAME")
  RESULT_FILES+=("${#pkg_files[@]}")
  RESULT_RECOMMENDED+=("$recommended")
  RESULT_CURRENT+=("$cur")
  RESULT_SUGGESTED+=("$suggested")
  RESULT_STATUS+=("$status")
  RESULT_CHANGELOG_OK+=("$changelog_ok")
  RESULT_PUBLISH+=("$PUBLISH")
done

# -----------------------------------------------------------------
# 5. Skill bundles + plugins + docs notes
# -----------------------------------------------------------------
for f in "${CHANGED_FILES[@]}"; do
  case "$f" in
    packages/skills/*/SKILL.md)
      SKILL_BUNDLE_NOTES+=("$f frontmatter changed — confirm \`version:\` in the YAML header was bumped if behaviour changed.")
      ;;
    plugins/*/plugin.yaml|plugins/*/SKILL.md|plugins/*/prompts/*)
      PLUGIN_NOTES+=("$f — community plugin change; bump the plugin's own version inside its manifest if shipping.")
      ;;
  esac
done

# -----------------------------------------------------------------
# 6. Cross-reference: stale version mentions in docs
# -----------------------------------------------------------------
STALE_HITS=()
for i in "${!RESULT_PKG[@]}"; do
  cur="${RESULT_CURRENT[$i]}"
  pub="${RESULT_PUBLISH[$i]}"
  [ "$pub" = "none" ] && continue
  # Compute the "old version" from the base ref.
  # If status is `needs-bump` the docs would reference $cur and not need
  # updating; skip in that case.
  if [ "${RESULT_STATUS[$i]}" = "needs-bump" ]; then continue; fi
  pkg_dir=""
  for entry in "${PKG_DIR_LIST[@]}"; do
    IFS='|' read -r pd pn _ _ <<< "$entry"
    if [ "$pn" = "${RESULT_PKG[$i]}" ]; then pkg_dir="$pd"; break; fi
  done
  [ -z "$pkg_dir" ] && continue
  manifest=""
  for entry in "${PKG_DIR_LIST[@]}"; do
    IFS='|' read -r pd pn pm _ <<< "$entry"
    if [ "$pn" = "${RESULT_PKG[$i]}" ]; then manifest="$pm"; break; fi
  done
  base_blob=$(git_show_or_empty "$BASE_REF" "$pkg_dir/$manifest")
  if [ "$manifest" = "package.json" ]; then
    old=$(extract_json_version_from_blob "$base_blob")
  else
    old=$(extract_toml_version_from_blob "$base_blob")
  fi
  [ -z "$old" ] && continue
  [ "$old" = "$cur" ] && continue
  # Grep docs/ for "vOLD" or "OLD" — but skip the package's own CHANGELOG
  # and any docs/node_modules tree (third-party content, not our docs).
  if [ -d docs ]; then
    while IFS= read -r hit; do
      [ -z "$hit" ] && continue
      STALE_HITS+=("$hit (references $old; package now $cur)")
    done < <(grep -RnE "(^|[^0-9])v?${old//./\\.}([^0-9]|$)" \
                  --include='*.md' --include='*.mdx' \
                  --exclude-dir=node_modules --exclude-dir=.astro --exclude-dir=dist \
                  docs 2>/dev/null \
              | grep -v "$pkg_dir/CHANGELOG.md" || true)
  fi
done

# Root CHANGELOG check: any publish-path bump should ideally be mentioned
# in the root index eventually. This is an INFO note only.
ROOT_CHANGELOG_NOTES=()
for i in "${!RESULT_PKG[@]}"; do
  status="${RESULT_STATUS[$i]}"
  pub="${RESULT_PUBLISH[$i]}"
  if [ "$status" != "ok" ] && [ "$status" != "missing-changelog" ] && [ "$status" != "bump-mismatch" ]; then
    continue
  fi
  if [ "$pub" = "none" ] || [ "$pub" = "private" ]; then continue; fi
  if [ -f CHANGELOG.md ] && grep -qF "${RESULT_PKG[$i]}" CHANGELOG.md 2>/dev/null; then
    : # mentioned somewhere
  else
    ROOT_CHANGELOG_NOTES+=("${RESULT_PKG[$i]} ${RESULT_CURRENT[$i]} — not yet listed in root CHANGELOG.md (batched at release time; informational).")
  fi
done

# Changeset presence check.
CHANGESET_MISSING=0
HAS_PUBLISH_CHANGE=0
for i in "${!RESULT_PUBLISH[@]}"; do
  pub="${RESULT_PUBLISH[$i]}"
  rec="${RESULT_RECOMMENDED[$i]}"
  if [ "$pub" = "npm" ] && [ "$rec" != "none" ]; then
    HAS_PUBLISH_CHANGE=1
    break
  fi
done
if [ "$HAS_PUBLISH_CHANGE" = "1" ]; then
  # Look for any new .changeset/*.md (excluding README + config) added or modified in the diff.
  changeset_changed=$(git diff --name-only "$BASE_REF...$HEAD_REF" -- '.changeset/*.md' 2>/dev/null \
    | grep -v 'README.md' | grep -v 'config.json' || true)
  if [ -z "$changeset_changed" ]; then
    CHANGESET_MISSING=1
  fi
fi

# -----------------------------------------------------------------
# 7. Emit output
# -----------------------------------------------------------------

emit_markdown() {
  echo "<!-- pr-version-check -->"
  echo "# Version impact"
  echo
  echo "Base: \`$BASE_REF\` · Head: \`$HEAD_REF\` · Files changed: ${#CHANGED_FILES[@]}"
  echo
  echo "_Advisory only. CI will not block on this report._"
  echo

  echo "## Touched packages"
  echo
  if [ "${#RESULT_PKG[@]}" -eq 0 ]; then
    echo "No publish-path packages touched."
  else
    echo "| Package | Files | Recommended | Current | Suggested | Status |"
    echo "|---|---|---|---|---|---|"
    for i in "${!RESULT_PKG[@]}"; do
      echo "| ${RESULT_PKG[$i]} | ${RESULT_FILES[$i]} | ${RESULT_RECOMMENDED[$i]} | ${RESULT_CURRENT[$i]} | ${RESULT_SUGGESTED[$i]} | ${RESULT_STATUS[$i]} |"
    done
  fi
  echo

  echo "## CHANGELOG check"
  echo
  if [ "${#RESULT_PKG[@]}" -eq 0 ]; then
    echo "(no publish-path packages touched)"
  else
    for i in "${!RESULT_PKG[@]}"; do
      rec="${RESULT_RECOMMENDED[$i]}"
      [ "$rec" = "none" ] && continue
      case "${RESULT_CHANGELOG_OK[$i]}" in
        yes) echo "- ✓ ${RESULT_PKG[$i]} — entry present for v${RESULT_CURRENT[$i]}" ;;
        no)  echo "- ✗ ${RESULT_PKG[$i]} — needed for v${RESULT_CURRENT[$i]}" ;;
        n/a) echo "- · ${RESULT_PKG[$i]} — no version bump yet, CHANGELOG check skipped" ;;
      esac
    done
  fi
  echo

  echo "## Docs cross-references that may be stale"
  echo
  if [ "${#STALE_HITS[@]}" -eq 0 ]; then
    echo "(none)"
  else
    for h in "${STALE_HITS[@]}"; do
      echo "- $h"
    done
  fi
  echo

  if [ "${#SKILL_BUNDLE_NOTES[@]}" -gt 0 ] || [ "${#PLUGIN_NOTES[@]}" -gt 0 ] || [ "${#ROOT_CHANGELOG_NOTES[@]}" -gt 0 ]; then
    echo "## Notes"
    echo
    for n in "${SKILL_BUNDLE_NOTES[@]}"; do echo "- $n"; done
    for n in "${PLUGIN_NOTES[@]}";       do echo "- $n"; done
    for n in "${ROOT_CHANGELOG_NOTES[@]}"; do echo "- $n"; done
    echo
  fi

  echo "## Suggested next steps"
  echo
  any_step=0
  for i in "${!RESULT_PKG[@]}"; do
    case "${RESULT_STATUS[$i]}" in
      needs-bump)
        echo "- [ ] Bump ${RESULT_PKG[$i]} from ${RESULT_CURRENT[$i]} to ${RESULT_SUGGESTED[$i]} (recommended: ${RESULT_RECOMMENDED[$i]})."
        any_step=1
        ;;
      bump-mismatch)
        echo "- [ ] Re-examine ${RESULT_PKG[$i]}: bumped to ${RESULT_CURRENT[$i]} but a ${RESULT_RECOMMENDED[$i]} change was detected. Confirm or upgrade the bump."
        any_step=1
        ;;
      missing-changelog)
        echo "- [ ] Add a CHANGELOG entry to ${RESULT_PKG[$i]} for v${RESULT_CURRENT[$i]}."
        any_step=1
        ;;
    esac
  done
  if [ "$CHANGESET_MISSING" = "1" ]; then
    echo "- [ ] Run \`pnpm changeset\` and commit the new file under \`.changeset/\` (no changeset detected for an npm-published change)."
    any_step=1
  fi
  if [ "${#STALE_HITS[@]}" -gt 0 ]; then
    echo "- [ ] Review the stale doc references above. Some may be intentional (\"starting in v0.4.0\") — only update version mentions that are meant to be current."
    any_step=1
  fi
  if [ "$any_step" = "0" ]; then
    echo "Nothing required. Push when ready."
  fi
}

emit_json() {
  # Build a minimal JSON object. jq makes this safer if available; fall
  # back to a hand-built string otherwise.
  if command -v jq >/dev/null 2>&1; then
    local pkgs_json="[]"
    if [ "${#RESULT_PKG[@]}" -gt 0 ]; then
      pkgs_json=$(for i in "${!RESULT_PKG[@]}"; do
        jq -n \
          --arg pkg "${RESULT_PKG[$i]}" \
          --arg files "${RESULT_FILES[$i]}" \
          --arg rec "${RESULT_RECOMMENDED[$i]}" \
          --arg cur "${RESULT_CURRENT[$i]}" \
          --arg sug "${RESULT_SUGGESTED[$i]}" \
          --arg st  "${RESULT_STATUS[$i]}" \
          --arg cl  "${RESULT_CHANGELOG_OK[$i]}" \
          --arg pub "${RESULT_PUBLISH[$i]}" \
          '{package:$pkg,files:($files|tonumber),recommended:$rec,current:$cur,suggested:$sug,status:$st,changelog:$cl,publish:$pub}'
      done | jq -s '.')
    fi
    local stale_json
    stale_json=$(printf '%s\n' "${STALE_HITS[@]}" | jq -R . | jq -s '.')
    jq -n \
      --arg base "$BASE_REF" \
      --arg head "$HEAD_REF" \
      --argjson pkgs "$pkgs_json" \
      --argjson stale "$stale_json" \
      --argjson cs_missing "$CHANGESET_MISSING" \
      '{base_ref:$base,head_ref:$head,touched_packages:$pkgs,stale_doc_refs:$stale,changeset_missing:($cs_missing==1)}'
  else
    # Hand-built fallback (best-effort; not full escape-safe).
    printf '{"base_ref":"%s","head_ref":"%s","touched_packages":[' "$BASE_REF" "$HEAD_REF"
    local first=1
    for i in "${!RESULT_PKG[@]}"; do
      [ "$first" = "1" ] || printf ','
      first=0
      printf '{"package":"%s","files":%s,"recommended":"%s","current":"%s","suggested":"%s","status":"%s","changelog":"%s","publish":"%s"}' \
        "${RESULT_PKG[$i]}" "${RESULT_FILES[$i]}" "${RESULT_RECOMMENDED[$i]}" \
        "${RESULT_CURRENT[$i]}" "${RESULT_SUGGESTED[$i]}" "${RESULT_STATUS[$i]}" \
        "${RESULT_CHANGELOG_OK[$i]}" "${RESULT_PUBLISH[$i]}"
    done
    printf '],"changeset_missing":%s}\n' "$([ "$CHANGESET_MISSING" = "1" ] && echo true || echo false)"
  fi
}

case "$FORMAT" in
  json) emit_json ;;
  *)    emit_markdown ;;
esac

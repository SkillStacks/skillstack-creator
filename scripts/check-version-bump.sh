#!/bin/bash
# SkillStack Creator: Post-commit version bump check
# Runs after Bash tool calls. Only activates on git commit/push.
# Non-blocking — provides context to Claude, doesn't prevent actions.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Only check git commit and git push commands
if ! echo "$COMMAND" | grep -qE 'git (commit|push)'; then
  exit 0
fi

# Only relevant if this repo has SkillStack config
MARKETPLACE=".claude-plugin/marketplace.json"
if [ ! -f "$MARKETPLACE" ]; then
  exit 0
fi

# Check if this repo has SkillStack distribution config
SKILLSTACK_CONFIG=".claude-plugin/skillstack.json"
HAS_SKILLSTACK=false
if [ -f "$SKILLSTACK_CONFIG" ]; then
  HAS_SKILLSTACK=true
fi

if [ "$HAS_SKILLSTACK" != "true" ]; then
  exit 0
fi

# For git push: just a friendly reminder
if echo "$COMMAND" | grep -q 'git push'; then
  cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"[SkillStack] Push detected. The SkillStack webhook will automatically sync any changes to marketplace.json or skillstack.json. If the version was bumped, buyers will get the new version shortly."}}
EOF
  exit 0
fi

# For git commit: check if plugin files changed but version didn't
if echo "$COMMAND" | grep -q 'git commit'; then
  # Get the files that were just committed
  COMMITTED_FILES=$(git diff --name-only HEAD~1 HEAD 2>/dev/null || echo "")

  if [ -z "$COMMITTED_FILES" ]; then
    exit 0
  fi

  # Check if any plugin source files changed (but not marketplace.json itself)
  PLUGIN_FILES_CHANGED=false
  VERSION_BUMPED=false

  if echo "$COMMITTED_FILES" | grep -v "marketplace.json" | grep -qE '\.(md|ts|js|json|py|sh)$'; then
    PLUGIN_FILES_CHANGED=true
  fi

  if echo "$COMMITTED_FILES" | grep -q "marketplace.json"; then
    # Check if version actually changed
    OLD_VERSIONS=$(git show HEAD~1:.claude-plugin/marketplace.json 2>/dev/null | jq -r '.plugins[]?.version // empty' | sort)
    NEW_VERSIONS=$(jq -r '.plugins[]?.version // empty' "$MARKETPLACE" | sort)
    if [ "$OLD_VERSIONS" != "$NEW_VERSIONS" ]; then
      VERSION_BUMPED=true
    fi
  fi

  if [ "$PLUGIN_FILES_CHANGED" = "true" ] && [ "$VERSION_BUMPED" != "true" ]; then
    cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"[SkillStack] Plugin files were committed but the version in marketplace.json was not bumped. Buyers will not receive these changes until the version is updated. If this was intentional (e.g., work in progress), no action needed. Otherwise, bump the version in .claude-plugin/marketplace.json before pushing."}}
EOF
    exit 0
  fi

  # Check plugin.json versions match marketplace.json versions
  # marketplace.json is the source of truth for SkillStack — plugin.json should stay in sync
  MISMATCHED=""
  PLUGIN_COUNT=$(jq -r '.plugins | length' "$MARKETPLACE" 2>/dev/null || echo "0")
  for i in $(seq 0 $(( PLUGIN_COUNT - 1 ))); do
    PLUGIN_NAME=$(jq -r ".plugins[$i].name // empty" "$MARKETPLACE" 2>/dev/null)
    MARKETPLACE_VERSION=$(jq -r ".plugins[$i].version // empty" "$MARKETPLACE" 2>/dev/null)
    SOURCE_PATH=$(jq -r ".plugins[$i].source // empty" "$MARKETPLACE" 2>/dev/null)

    # Skip plugins without a local source path (e.g., npm-only entries)
    if [ -z "$SOURCE_PATH" ] || echo "$SOURCE_PATH" | grep -q '"source"'; then
      continue
    fi

    # Resolve plugin.json path from source
    PLUGIN_JSON="${SOURCE_PATH#./}/.claude-plugin/plugin.json"
    if [ ! -f "$PLUGIN_JSON" ]; then
      continue
    fi

    PLUGIN_JSON_VERSION=$(jq -r '.version // empty' "$PLUGIN_JSON" 2>/dev/null)
    if [ -n "$MARKETPLACE_VERSION" ] && [ -n "$PLUGIN_JSON_VERSION" ] && [ "$MARKETPLACE_VERSION" != "$PLUGIN_JSON_VERSION" ]; then
      MISMATCHED="${MISMATCHED}  - ${PLUGIN_NAME}: marketplace.json has v${MARKETPLACE_VERSION}, plugin.json has v${PLUGIN_JSON_VERSION}\n"
    fi
  done

  if [ -n "$MISMATCHED" ]; then
    # Escape for JSON
    MISMATCHED_MSG=$(echo -e "$MISMATCHED" | sed 's/"/\\"/g' | tr '\n' ' ')
    cat <<EOF
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"[SkillStack] Version mismatch between marketplace.json and plugin.json: ${MISMATCHED_MSG}marketplace.json is the source of truth for SkillStack distribution. Update plugin.json to match so buyers see consistent version info."}}
EOF
    exit 0
  fi
fi

exit 0

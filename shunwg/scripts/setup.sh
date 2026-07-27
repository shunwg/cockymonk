#!/usr/bin/env bash
# One-time environment setup for the Snifferoo project. Safe to re-run.
set -euo pipefail
say(){ printf "\n\033[1m== %s ==\033[0m\n" "$*"; }

say "Checking prerequisites"
command -v xcodebuild >/dev/null || { echo "Xcode not found — install Xcode 26.3+ from the App Store first."; exit 1; }
command -v node >/dev/null       || { echo "Node.js not found — install from nodejs.org (needed for Claude Code + XcodeBuildMCP)."; exit 1; }
command -v claude >/dev/null     || { echo "Claude Code not found. Install: npm install -g @anthropic-ai/claude-code"; exit 1; }
echo "OK: xcodebuild, node, claude"

say "Optional helpers (brew)"
if command -v brew >/dev/null; then
  for pkg in xcodegen jq xcbeautify; do
    command -v "$pkg" >/dev/null || { echo "Installing $pkg..."; brew install "$pkg"; }
  done
else
  echo "Homebrew not found — install xcodegen, jq, xcbeautify manually (all optional but recommended)."
fi

say "MCP: XcodeBuildMCP (core toolbelt)"
claude mcp add xcodebuild -- npx -y xcodebuildmcp@latest 2>/dev/null || echo "(already added)"
npx -y xcodebuildmcp@latest init || true

say "Skill: ios-simulator (lets Claude play-test the game)"
if [ ! -d .claude/skills/ios-simulator ]; then
  git clone https://github.com/conorluddy/ios-simulator-skill.git .claude/skills/ios-simulator
else echo "(already present)"; fi

say "Generate the Xcode project"
if command -v xcodegen >/dev/null; then
  grep -q EDITME project.yml && echo "NOTE: project.yml still contains EDITME placeholders (bundle id / team). Edit, then re-run: xcodegen generate"
  xcodegen generate || true
fi

say "Do these inside a Claude Code session (plugins can't be scripted):"
cat <<'TXT'
  /plugin install frontend-design
  /plugin install code-review
  /plugin install security-guidance
Optional (see TOOLBELT.md): Xcode native MCP -> enable in Xcode Settings > Intelligence, then:
  claude mcp add --transport stdio xcode -- xcrun mcpbridge
TXT

say "Done. First session: open 'claude' here and paste the kickoff prompt from README.md"

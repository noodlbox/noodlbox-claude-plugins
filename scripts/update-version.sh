#!/bin/bash
set -euo pipefail

VERSION="$1"

# Update plugin.json
jq --arg v "$VERSION" '.version = $v' .claude-plugin/plugin.json > tmp.json
mv tmp.json .claude-plugin/plugin.json

# Update marketplace.json
jq --arg v "$VERSION" '.metadata.version = $v | .plugins[0].version = $v' .claude-plugin/marketplace.json > tmp.json
mv tmp.json .claude-plugin/marketplace.json

echo "Updated versions to $VERSION"

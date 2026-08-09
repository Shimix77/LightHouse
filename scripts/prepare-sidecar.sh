#!/usr/bin/env bash
set -euo pipefail

profile="${1:-release}"
target_triple="${LIGHTHOUSE_TARGET_TRIPLE:-$(rustc --print host-tuple)}"
case "$target_triple" in
  *-windows-*) executable_suffix=".exe" ;;
  *) executable_suffix="" ;;
esac

cargo_args=(build -p lighthouse-show-engine-app --target "$target_triple")
if [[ "$profile" == "release" ]]; then
  cargo_args+=(--release)
fi
cargo "${cargo_args[@]}"

source_binary="target/$target_triple/$profile/lighthouse-show-engine-app$executable_suffix"
destination_directory="apps/desktop/binaries"
destination_binary="$destination_directory/lighthouse-show-engine-app-$target_triple$executable_suffix"

if [[ ! -x "$source_binary" && ! -f "$source_binary" ]]; then
  echo "Sidecar build did not produce $source_binary" >&2
  exit 1
fi

mkdir -p "$destination_directory"
cp "$source_binary" "$destination_binary"
chmod +x "$destination_binary"
echo "Prepared LightHouse sidecar: $destination_binary"

#!/usr/bin/env bash
# Build the browser engine and the small website dictionary from a sibling checkout of ekushenext.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MAIN="${EKUSHE_REPO:-$HERE/../../ekushenext}"
OUT="$HERE/../site/engine"
WORDS="${WORDS:-30000}"    # dictionary size: most frequent words kept
PAIRS="${PAIRS:-3}"        # next-word suggestions kept per word
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

rustup target add wasm32-unknown-unknown >/dev/null
cargo build --release --manifest-path "$HERE/Cargo.toml" --lib --target wasm32-unknown-unknown
cargo build --release --manifest-path "$HERE/Cargo.toml" --bin trim-dict
cargo build --release --manifest-path "$MAIN/tools/dict-builder/Cargo.toml"

"$HERE/target/release/trim-dict" "$MAIN/data/dictionary/lexicon.tsv" "$MAIN/data/dictionary/ekushe.dict.z" "$WORDS" "$WORK" "$PAIRS"
"$MAIN/tools/dict-builder/target/release/ekushe-dict" pack --lexicon "$WORK/lexicon.tsv" \
  --english "$MAIN/data/dictionary/roman/english-matches.tsv" --pairs "$WORK/pairs.tsv" \
  --vulgar "$MAIN/tools/dict-builder/curated/vulgar-prefixes.tsv" --out "$WORK/web.dict"

cp "$HERE/target/wasm32-unknown-unknown/release/ekushe_web.wasm" "$OUT/ekushe.wasm"
cp "$WORK/web.dict.z" "$OUT/ekushe-web.dict.z"
ls -la "$OUT"

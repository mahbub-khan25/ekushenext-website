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

CUR="$MAIN/tools/dict-builder/curated"
# the spoken forms, names and chat words the full dictionary is packed with stay in the small one too
{ grep -v '^#' "$CUR/spoken-verbs.tsv" | awk -F'\t' 'NF>=3{print $1; print $3}'
  grep -hv '^#' "$CUR/names.tsv" "$CUR/chat-words.tsv" | awk -F'\t' 'NF>=2{n=split($2,c,"|"); for(i=1;i<=n;i++) print c[i]}'
  grep -v '^#' "$CUR/chat-phrases.txt" | sed 's/।/ /g; s/[.,!?]/ /g' | tr -s ' \t' '\n'
} | sort -u > "$WORK/keep.txt"
"$HERE/target/release/trim-dict" "$MAIN/data/dictionary/lexicon.tsv" "$MAIN/data/dictionary/ekushe.dict.z" "$WORDS" "$WORK" "$PAIRS" "$WORK/keep.txt"
"$MAIN/tools/dict-builder/target/release/ekushe-dict" pack --lexicon "$WORK/lexicon.tsv" \
  --english "$MAIN/data/dictionary/roman/english-matches.tsv" --pairs "$WORK/pairs.tsv" \
  --phrases "$CUR/chat-phrases.txt" --spoken "$CUR/spoken-verbs.tsv" --keys "$CUR/names.tsv,$CUR/chat-words.tsv" \
  --vulgar "$CUR/vulgar-prefixes.tsv" --out "$WORK/web.dict"

cp "$HERE/target/wasm32-unknown-unknown/release/ekushe_web.wasm" "$OUT/ekushe.wasm"
cp "$WORK/web.dict.z" "$OUT/ekushe-web.dict.z"
ls -la "$OUT"

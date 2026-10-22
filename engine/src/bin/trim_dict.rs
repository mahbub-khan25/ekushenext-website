//! Make a small dictionary for the website demo from the full Ekushe Next dictionary.
//!
//! `trim-dict LEXICON.tsv FULL.dict.z N OUT_DIR [PAIRS_PER_WORD]` keeps the N most frequent words of the lexicon
//! (it is sorted by frequency) and the word pairs between them, and writes `lexicon.tsv` and
//! `pairs.tsv` into OUT_DIR for `ekushe-dict pack`.
use ekushe_core::dict::Dictionary;
use std::collections::HashSet;
use std::fmt::Write as _;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let (lex, full, n, out) = (&a[1], &a[2], a[3].parse::<usize>().unwrap(), &a[4]);
    let per_word: usize = a.get(5).and_then(|v| v.parse().ok()).unwrap_or(4);
    let text = std::fs::read_to_string(lex).unwrap();
    let mut lines = text.lines();
    let mut kept = String::new();
    kept.push_str(lines.next().unwrap());
    kept.push('\n');
    let mut words = HashSet::new();
    for l in lines {
        if words.len() >= n {
            break;
        }
        let f: Vec<&str> = l.split('\t').collect();
        // skip rare tiers and suspected typos so the small dictionary stays clean
        if f.len() < 10 || f[9].contains("suspect_typo_of") {
            continue;
        }
        words.insert(f[0].to_string());
        kept.push_str(l);
        kept.push('\n');
    }
    std::fs::write(format!("{out}/lexicon.tsv"), kept).unwrap();

    let d = Dictionary::from_compressed(&std::fs::read(full).unwrap()).unwrap();
    let mut pairs = String::new();
    let mut np = 0;
    for w in &words {
        if let Some(id) = d.id_of(w) {
            for (next, c) in d.followers(id).into_iter().take(per_word) {
                let nw = d.word(next);
                if words.contains(nw) {
                    let _ = writeln!(pairs, "{w}\t{nw}\t{}", (c as u32).max(5));
                    np += 1;
                }
            }
        }
    }
    std::fs::write(format!("{out}/pairs.tsv"), pairs).unwrap();
    eprintln!("kept {} words, {np} pairs", words.len());
}

//! Make a small dictionary for the website demo from the full Ekushe Next dictionary.
//!
//! `trim-dict LEXICON.tsv FULL.dict.z N OUT_DIR [PAIRS_PER_WORD] [KEEP.txt]` keeps the N most frequent words of
//! the lexicon (it is sorted by frequency), plus every word listed in KEEP.txt (one per line: the spoken
//! forms, names and chat words the full dictionary is packed with), and the word pairs between them, and
//! writes `lexicon.tsv` and `pairs.tsv` into OUT_DIR for `ekushe-dict pack`.
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
    let keep: HashSet<String> = a
        .get(6)
        .map(|p| std::fs::read_to_string(p).unwrap().lines().map(|w| w.trim().to_string()).filter(|w| !w.is_empty()).collect())
        .unwrap_or_default();
    let mut words = HashSet::new();
    let mut top = 0;
    for l in lines {
        let f: Vec<&str> = l.split('\t').collect();
        if f.len() < 10 {
            continue;
        }
        if keep.contains(f[0]) {
            words.insert(f[0].to_string());
            kept.push_str(l);
            kept.push('\n');
            continue;
        }
        // skip suspected typos so the small dictionary stays clean
        if top >= n || f[9].contains("suspect_typo_of") {
            continue;
        }
        top += 1;
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

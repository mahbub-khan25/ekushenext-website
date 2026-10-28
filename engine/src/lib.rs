//! Ekushe Next engine for the browser. A tiny C-style interface (no bindings generator):
//! JavaScript writes UTF-8 into memory from `ek_alloc`, calls a function, then reads the
//! JSON result at `ek_out_ptr()` / `ek_out_len()`.
use ekushe_core::dict::Dictionary;
use ekushe_core::{Ekushe, SessionOutput};
use std::cell::RefCell;

thread_local! {
    static ENGINE: RefCell<Option<Ekushe>> = const { RefCell::new(None) };
    static OUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[no_mangle]
pub extern "C" fn ek_alloc(len: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len);
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// # Safety
/// `ptr`/`len` must come from `ek_alloc`; ownership passes back to Rust.
#[no_mangle]
pub unsafe extern "C" fn ek_free(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

#[no_mangle]
pub extern "C" fn ek_out_ptr() -> *const u8 {
    OUT.with(|o| o.borrow().as_ptr())
}

#[no_mangle]
pub extern "C" fn ek_out_len() -> usize {
    OUT.with(|o| o.borrow().len())
}

fn emit(s: &SessionOutput) {
    let json = serde_json::to_vec(s).unwrap_or_default();
    OUT.with(|o| *o.borrow_mut() = json);
}

fn with<F: FnOnce(&mut Ekushe) -> SessionOutput>(f: F) {
    ENGINE.with(|e| {
        let mut e = e.borrow_mut();
        let eng = e.get_or_insert_with(Ekushe::default);
        let out = f(eng);
        emit(&out);
    });
}

/// Start the engine. `dict` is a zlib-compressed dictionary (`ekushe.dict.z`); pass len 0 for none.
/// Returns the number of dictionary words loaded.
///
/// # Safety
/// `ptr`/`len` must describe readable memory.
#[no_mangle]
pub unsafe extern "C" fn ek_init(ptr: *const u8, len: usize) -> u32 {
    let mut eng = Ekushe::default();
    let mut n = 0;
    if len > 0 {
        let bytes = std::slice::from_raw_parts(ptr, len);
        if let Ok(d) = Dictionary::from_compressed(bytes) {
            n = d.len() as u32;
            let d: &'static Dictionary = Box::leak(Box::new(d));
            eng.suggestions_engine_mut().set_dictionary(Some(d));
        }
    }
    ENGINE.with(|e| *e.borrow_mut() = Some(eng));
    n
}

/// Type one character (Unicode scalar value).
#[no_mangle]
pub extern "C" fn ek_key(ch: u32) {
    let c = char::from_u32(ch).unwrap_or(' ');
    with(|e| e.push_char(c, false));
}

/// Backspace. Right after a word it reopens that word with its suggestions (the Roman letters
/// typed, the English spelling among them), as in the apps: `delete_before` says how much to remove.
#[no_mangle]
pub extern "C" fn ek_backspace() {
    with(|e| e.reopen_last_word().unwrap_or_else(|| e.backspace()));
}

/// Commit candidate `index`; `trailing` is a character to add after it (0 for none).
#[no_mangle]
pub extern "C" fn ek_select(index: u32, trailing: u32) {
    let t = if trailing == 0 { None } else { char::from_u32(trailing) };
    with(|e| e.select_candidate(index as usize, t));
}

#[no_mangle]
pub extern "C" fn ek_commit(trailing: u32) {
    let t = if trailing == 0 { None } else { char::from_u32(trailing) };
    with(|e| e.commit_default(t));
}

#[no_mangle]
pub extern "C" fn ek_reset() {
    with(|e| {
        e.reset_composition();
        SessionOutput::default()
    });
}

fn emit_text(s: String) {
    OUT.with(|o| *o.borrow_mut() = s.into_bytes());
}

/// Convert Bijoy (SutonnyMJ) text to Unicode Bangla; result at `ek_out_ptr`.
///
/// # Safety
/// `ptr`/`len` must describe readable UTF-8.
#[no_mangle]
pub unsafe extern "C" fn ek_bijoy_to_unicode(ptr: *const u8, len: usize) {
    let s = std::str::from_utf8(std::slice::from_raw_parts(ptr, len)).unwrap_or("");
    emit_text(ekushe_core::convert::bijoy_to_unicode(s));
}

/// Convert Unicode Bangla to Bijoy (SutonnyMJ) text; result at `ek_out_ptr`.
///
/// # Safety
/// `ptr`/`len` must describe readable UTF-8.
#[no_mangle]
pub unsafe extern "C" fn ek_unicode_to_bijoy(ptr: *const u8, len: usize) {
    let s = std::str::from_utf8(std::slice::from_raw_parts(ptr, len)).unwrap_or("");
    emit_text(ekushe_core::convert::unicode_to_bijoy(s));
}

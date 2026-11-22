//! Βοηθητικά για timestamps — όλα ISO-8601 UTC strings (βλ. API-CONTRACT.md §Γενικά).

use time::format_description::well_known::Rfc3339;
use time::{Duration, OffsetDateTime};

pub fn now() -> OffsetDateTime {
    OffsetDateTime::now_utc()
}

pub fn now_iso() -> String {
    format_iso(now())
}

pub fn format_iso(t: OffsetDateTime) -> String {
    // Το RFC3339 formatting δεν αποτυγχάνει ποτέ για OffsetDateTime — μόνο
    // custom format descriptions με ελλιπή πεδία μπορούν να σκάσουν εδώ.
    t.format(&Rfc3339)
        .expect("RFC3339 formatting of OffsetDateTime never fails")
}

pub fn parse_iso(s: &str) -> Option<OffsetDateTime> {
    OffsetDateTime::parse(s, &Rfc3339).ok()
}

/// Always `YYYY-MM-DDTHH:MM:SS.mmmZ`, including trailing zeros.
/// RFC3339 from the `time` crate drops them, and text order then disagrees
/// with time order (`.950Z` sorts before `.9Z`).
pub fn format_iso_millis(t: OffsetDateTime) -> String {
    let utc = t.to_offset(time::UtcOffset::UTC);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        utc.year(),
        u8::from(utc.month()),
        utc.day(),
        utc.hour(),
        utc.minute(),
        utc.second(),
        utc.millisecond(),
    )
}

/// Last-write-wins on instants. `Some(canonical)` when the incoming write
/// should be stored; `None` when the existing row is newer or the same instant.
/// A timestamp ahead of `now` is clamped to `now` before the comparison.
pub fn lww_store_timestamp(incoming: &str, existing: Option<&str>, now: &str) -> Option<String> {
    let now_i = parse_iso(now).unwrap_or(OffsetDateTime::UNIX_EPOCH);
    let Some(incoming_i) = parse_iso(incoming) else {
        // Legacy/malformed `updated_at`: never overwrite an existing row, and
        // never invent a 1970 timestamp for a new one — keep it as sent.
        return existing.is_none().then(|| incoming.to_string());
    };
    let clamped = if incoming_i > now_i {
        now_i
    } else {
        incoming_i
    };
    if let Some(existing) = existing {
        let existing_i = parse_iso(existing).unwrap_or(OffsetDateTime::UNIX_EPOCH);
        if clamped <= existing_i {
            return None;
        }
    }
    Some(format_iso_millis(clamped))
}

pub fn iso_in(duration: Duration) -> String {
    format_iso(now() + duration)
}

pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for i in 0..a.len() {
        diff |= a[i] ^ b[i];
    }
    diff == 0
}

/// ISO timestamp `days` μέρες στο παρελθόν — για GC/retention cutoffs.
/// `days` clamped στο >= 0 ώστε να μη γυρνά ποτέ μελλοντικό cutoff.
pub fn iso_days_ago(days: i64) -> String {
    format_iso(now() - Duration::days(days.max(0)))
}

#[cfg(test)]
mod tests {
    use super::constant_time_eq;

    #[test]
    fn constant_time_eq_matches_only_identical_bytes() {
        assert!(constant_time_eq(b"same", b"same"));
        assert!(!constant_time_eq(b"same", b"diff"));
        assert!(!constant_time_eq(b"same", b"same-longer"));
    }
}

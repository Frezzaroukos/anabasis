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

pub fn iso_in(duration: Duration) -> String {
    format_iso(now() + duration)
}

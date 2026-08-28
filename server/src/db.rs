use std::path::Path;
use std::time::Duration;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::SqlitePool;

/// Ανοίγει (δημιουργώντας αν χρειάζεται) το SQLite DB και τρέχει τα migrations.
///
/// Τα `journal_mode`/`busy_timeout` περνάνε μέσω `SqliteConnectOptions` ώστε να
/// εφαρμόζονται σε ΚΑΘΕ connection του pool (per-connection pragmas στο SQLite).
pub async fn connect(db_path: &Path) -> Result<SqlitePool, sqlx::Error> {
    if let Some(parent) = db_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }

    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_secs(5))
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|e| sqlx::Error::Configuration(e.into()))?;

    Ok(pool)
}

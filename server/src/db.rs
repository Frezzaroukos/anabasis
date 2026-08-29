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

/// Διαβάζει ή δημιουργεί το epoch της βάσης — INSERT OR IGNORE + SELECT ώστε
/// δύο ταυτόχρονα starts να καταλήγουν πάντα στην ίδια τιμή.
pub async fn get_or_create_epoch(pool: &SqlitePool) -> Result<String, sqlx::Error> {
    let candidate = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT OR IGNORE INTO meta (key, value) VALUES ('epoch', ?)")
        .bind(&candidate)
        .execute(pool)
        .await?;
    let (epoch,): (String,) = sqlx::query_as("SELECT value FROM meta WHERE key = 'epoch'")
        .fetch_one(pool)
        .await?;
    Ok(epoch)
}

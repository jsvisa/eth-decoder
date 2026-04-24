use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AbiEntry {
    pub text_sign: String,
    pub abi: Option<String>,
    pub score: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DbStats {
    pub row_count: i64,
}

pub fn init_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS func_signs (
            pkey      TEXT PRIMARY KEY,
            byte_sign TEXT NOT NULL,
            text_sign TEXT NOT NULL,
            abi       TEXT,
            score     INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS func_signs_byte_idx ON func_signs (byte_sign);"
    )
}

pub fn lookup_abi(conn: &Connection, byte_sign: &str, count: usize) -> Result<Vec<AbiEntry>> {
    let limit = count.min(10) as i64;
    let mut stmt = conn.prepare(
        "SELECT text_sign, abi, score FROM func_signs
         WHERE byte_sign = ?1
         ORDER BY score DESC
         LIMIT ?2"
    )?;
    let entries = stmt.query_map(params![byte_sign, limit], |row| {
        Ok(AbiEntry {
            text_sign: row.get(0)?,
            abi: row.get(1)?,
            score: row.get(2)?,
        })
    })?.collect::<Result<Vec<_>>>()?;
    Ok(entries)
}

pub fn lookup_event_abi(conn: &Connection, topic0: &str, count: usize) -> Result<Vec<AbiEntry>> {
    lookup_abi(conn, topic0, count)
}

pub fn get_stats(conn: &Connection) -> Result<DbStats> {
    let row_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM func_signs",
        [],
        |row| row.get(0),
    )?;
    Ok(DbStats { row_count })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub rows_imported: u64,
}

pub fn import_csv(conn: &Connection, file_path: &str) -> std::result::Result<ImportResult, Box<dyn std::error::Error>> {
    let mut rdr = csv::Reader::from_path(file_path)?;
    let tx = conn.unchecked_transaction()?;
    let mut count: u64 = 0;
    for record in rdr.records() {
        let r = record?;
        let pkey      = r.get(0).unwrap_or("");
        let byte_sign = r.get(1).unwrap_or("");
        let text_sign = r.get(2).unwrap_or("");
        let abi       = r.get(3).filter(|s| !s.is_empty() && *s != "null");
        let score: i64 = r.get(4).and_then(|s| s.parse().ok()).unwrap_or(0);
        let inserted = tx.execute(
            "INSERT OR IGNORE INTO func_signs (pkey, byte_sign, text_sign, abi, score)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![pkey, byte_sign, text_sign, abi, score],
        )?;
        count += inserted as u64;
    }
    tx.commit()?;
    Ok(ImportResult { rows_imported: count })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn lookup_abi_returns_empty_for_unknown_sign() {
        let conn = setup();
        let result = lookup_abi(&conn, "0xdeadbeef", 1).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn lookup_abi_returns_entry_for_known_sign() {
        let conn = setup();
        conn.execute(
            "INSERT INTO func_signs VALUES ('pk1', '0xb82e16e3', 'getAdapters()', '{\"name\":\"getAdapters\"}', 1)",
            [],
        ).unwrap();
        let result = lookup_abi(&conn, "0xb82e16e3", 1).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].text_sign, "getAdapters()");
        assert_eq!(result[0].score, 1);
    }

    #[test]
    fn lookup_abi_returns_results_sorted_by_score_desc() {
        let conn = setup();
        conn.execute(
            "INSERT INTO func_signs VALUES ('pk1', '0xb82e16e3', 'getAdapters()', null, 1)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO func_signs VALUES ('pk2', '0xb82e16e3', 'getAdapters()', null, 10)",
            [],
        ).unwrap();
        let result = lookup_abi(&conn, "0xb82e16e3", 2).unwrap();
        assert_eq!(result[0].score, 10);
        assert_eq!(result[1].score, 1);
    }

    #[test]
    fn lookup_abi_respects_count_limit() {
        let conn = setup();
        for i in 0..5i64 {
            conn.execute(
                "INSERT INTO func_signs VALUES (?1, '0xb82e16e3', 'getAdapters()', null, ?2)",
                params![format!("pk{}", i), i],
            ).unwrap();
        }
        let result = lookup_abi(&conn, "0xb82e16e3", 2).unwrap();
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn lookup_abi_clamps_count_to_10() {
        let conn = setup();
        for i in 0..15i64 {
            conn.execute(
                "INSERT INTO func_signs VALUES (?1, '0xb82e16e3', 'getAdapters()', null, ?2)",
                params![format!("pk{}", i), i],
            ).unwrap();
        }
        let result = lookup_abi(&conn, "0xb82e16e3", 50).unwrap();
        assert_eq!(result.len(), 10);
    }

    #[test]
    fn lookup_event_abi_finds_event_by_topic0() {
        let conn = setup();
        let topic0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
        conn.execute(
            "INSERT INTO func_signs VALUES ('ev1', ?1, 'Transfer(address,address,uint256)', null, 3)",
            params![topic0],
        ).unwrap();
        let result = lookup_event_abi(&conn, topic0, 1).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].text_sign, "Transfer(address,address,uint256)");
    }

    #[test]
    fn get_stats_returns_row_count() {
        let conn = setup();
        conn.execute(
            "INSERT INTO func_signs VALUES ('pk1', '0xb82e16e3', 'getAdapters()', null, 1)",
            [],
        ).unwrap();
        let stats = get_stats(&conn).unwrap();
        assert_eq!(stats.row_count, 1);
    }

    #[test]
    fn get_stats_returns_zero_for_empty_db() {
        let conn = setup();
        let stats = get_stats(&conn).unwrap();
        assert_eq!(stats.row_count, 0);
    }

    #[test]
    fn import_csv_inserts_rows() {
        use std::io::Write;
        let conn = setup();
        let mut tmp = tempfile::NamedTempFile::new().unwrap();
        writeln!(tmp, "pkey,byte_sign,text_sign,abi,score").unwrap();
        writeln!(tmp, r#"abc123,0xb82e16e3,getAdapters(),"{{""name"":""getAdapters""}}",1"#).unwrap();
        writeln!(tmp, r#"def456,0xa9059cbb,"transfer(address,uint256)",,5"#).unwrap();
        let result = import_csv(&conn, tmp.path().to_str().unwrap()).unwrap();
        assert_eq!(result.rows_imported, 2);
        assert_eq!(get_stats(&conn).unwrap().row_count, 2);
    }

    #[test]
    fn import_csv_skips_duplicate_pkeys() {
        use std::io::Write;
        let conn = setup();
        let mut tmp = tempfile::NamedTempFile::new().unwrap();
        writeln!(tmp, "pkey,byte_sign,text_sign,abi,score").unwrap();
        writeln!(tmp, "abc123,0xb82e16e3,getAdapters(),,1").unwrap();
        import_csv(&conn, tmp.path().to_str().unwrap()).unwrap();
        // Import same file again — duplicate pkey must be ignored
        let result = import_csv(&conn, tmp.path().to_str().unwrap()).unwrap();
        assert_eq!(result.rows_imported, 0); // 0 NEW rows inserted (all were duplicates)
        assert_eq!(get_stats(&conn).unwrap().row_count, 1); // still only 1 in db
    }

    #[test]
    fn import_csv_handles_extra_columns() {
        use std::io::Write;
        let conn = setup();
        let mut tmp = tempfile::NamedTempFile::new().unwrap();
        // Full CSV with created_at and updated_at columns (should be ignored)
        writeln!(tmp, "pkey,byte_sign,text_sign,abi,score,created_at,updated_at").unwrap();
        writeln!(tmp, "abc123,0xb82e16e3,getAdapters(),,1,2024-01-01,2024-01-01").unwrap();
        let result = import_csv(&conn, tmp.path().to_str().unwrap()).unwrap();
        assert_eq!(result.rows_imported, 1);
    }
}

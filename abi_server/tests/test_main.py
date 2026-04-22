import main as main_module


def test_get_db_connection_uses_sqlite(db_path):
    """get_db_connection() should return a sqlite3 connection when DB_URL is sqlite:///."""
    import sqlite3
    conn = main_module.get_db_connection()
    assert isinstance(conn, sqlite3.Connection)
    conn.close()

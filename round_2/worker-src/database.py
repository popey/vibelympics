import sqlite3
import os
from contextlib import contextmanager
from .config import settings

# Ensure data directory exists
os.makedirs(os.path.dirname(settings.database_path), exist_ok=True)


def get_connection():
    """Get a database connection with row factory."""
    conn = sqlite3.connect(settings.database_path)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def get_db():
    """Context manager for database connections."""
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

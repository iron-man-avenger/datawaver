import sqlite3
from pathlib import Path

def main():
    path = Path(__file__).resolve().parent.parent / "datawaver.db"
    conn = sqlite3.connect(path)
    cursor = conn.cursor()
    print("Columns:")
    cursor.execute("PRAGMA table_info(users);")
    for row in cursor.fetchall():
        print(row)
    print("Users:")
    cursor.execute("SELECT id, username, is_admin, active, history_access, password_hash FROM users;")
    for row in cursor.fetchall():
        print(row)
    conn.close()

if __name__ == "__main__":
    main()

"""
Initialize the admin user for Data Weaver
Run this script once to set up the first admin account
"""

import sqlite3
import bcrypt
import os
from pathlib import Path

# Get or create the db folder
DB_PATH = os.path.join(os.path.dirname(__file__), "datawaver.db")

def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def init_admin():
    """Initialize admin user"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create tables if they don't exist
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            active INTEGER DEFAULT 1
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            action TEXT NOT NULL,
            table_name TEXT,
            record_id TEXT,
            old_value TEXT,
            new_value TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    
    # Check if any users exist
    cursor.execute("SELECT COUNT(*) FROM users")
    user_count = cursor.fetchone()[0]
    
    if user_count > 0:
        print("✓ Admin users already exist!")
        cursor.execute("SELECT username, is_admin FROM users WHERE is_admin = 1")
        admins = cursor.fetchall()
        if admins:
            print("\nCurrent admin users:")
            for admin in admins:
                print(f"  - {admin[0]}")
        conn.close()
        return
    
    print("=" * 50)
    print("Data Weaver - Admin Initialization")
    print("=" * 50)
    
    # Get admin credentials
    username = input("\nEnter admin username: ").strip()
    
    if not username:
        print("Error: Username cannot be empty")
        conn.close()
        return
    
    password = input("Enter admin password: ").strip()
    
    if not password:
        print("Error: Password cannot be empty")
        conn.close()
        return
    
    # Confirm password
    password_confirm = input("Confirm admin password: ").strip()
    
    if password != password_confirm:
        print("Error: Passwords do not match")
        conn.close()
        return
    
    # Hash and store password
    password_hash = hash_password(password)
    
    try:
        cursor.execute(
            "INSERT INTO users (username, password_hash, is_admin, active) VALUES (?, ?, 1, 1)",
            (username, password_hash)
        )
        conn.commit()
        print(f"\n✓ Admin user '{username}' created successfully!")
        print("\nYou can now log in with:")
        print(f"  Username: {username}")
        print(f"  Password: {password}")
    except sqlite3.IntegrityError:
        print(f"Error: Username '{username}' already exists")
    finally:
        conn.close()

if __name__ == "__main__":
    init_admin()

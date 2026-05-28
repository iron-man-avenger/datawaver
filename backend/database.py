"""
SQLite Database operations for Data Weaver
Handles users, authentication, and audit logs
"""

import sqlite3
import bcrypt
import os
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any
from cryptography.fernet import Fernet

# Database path - local folder
DB_PATH = os.path.join(os.path.dirname(__file__), "datawaver.db")

# Encryption key for password storage (stored locally)
ENCRYPTION_KEY_PATH = os.path.join(os.path.dirname(__file__), ".encryption_key")

def get_or_create_encryption_key():
    """Get or create the encryption key for reversible password encryption"""
    if os.path.exists(ENCRYPTION_KEY_PATH):
        with open(ENCRYPTION_KEY_PATH, 'rb') as f:
            return f.read()
    else:
        key = Fernet.generate_key()
        with open(ENCRYPTION_KEY_PATH, 'wb') as f:
            f.write(key)
        return key

ENCRYPTION_KEY = get_or_create_encryption_key()
cipher = Fernet(ENCRYPTION_KEY)

def encrypt_password(password: str) -> str:
    """Encrypt a plain password for storage"""
    return cipher.encrypt(password.encode('utf-8')).decode('utf-8')

def decrypt_password(encrypted_password: str) -> str:
    """Decrypt a stored encrypted password"""
    try:
        return cipher.decrypt(encrypted_password.encode('utf-8')).decode('utf-8')
    except Exception:
        return ""

def get_db_connection():
    """Create a database connection"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database tables"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            encrypted_password TEXT,
            is_admin INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            active INTEGER DEFAULT 1,
            history_access INTEGER DEFAULT 0
        )
    ''')
    
    # Audit log table
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
    conn.close()
    print(f"Database initialized at {DB_PATH}")

    # Ensure history_access column exists for upgrades from older schemas
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(users)")
    columns = {row["name"] for row in cursor.fetchall()}
    if "history_access" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN history_access INTEGER DEFAULT 0")
        conn.commit()
    if "encrypted_password" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN encrypted_password TEXT")
        conn.commit()
    conn.close()

def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its bcrypt hash"""
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))

def get_user(username: str) -> Optional[Dict[str, Any]]:
    """Get user by username"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM users WHERE username = ? AND active = 1", (username,))
    user = cursor.fetchone()
    conn.close()
    
    if user:
        user_dict = dict(user)
        # Decrypt password if available
        if user_dict.get("encrypted_password"):
            user_dict["password"] = decrypt_password(user_dict["encrypted_password"])
        return user_dict
    return None

def authenticate_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    """Authenticate user with username and password"""
    user = get_user(username)
    if not user:
        return None
    
    if verify_password(password, user['password_hash']):
        return user
    return None

def create_user(username: str, password: str, is_admin: bool = False, history_access: bool = False) -> bool:
    """Create a new user"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        password_hash = hash_password(password)
        encrypted_pwd = encrypt_password(password)
        
        cursor.execute(
            "INSERT INTO users (username, password_hash, encrypted_password, is_admin, active, history_access) VALUES (?, ?, ?, ?, 1, ?)",
            (username, password_hash, encrypted_pwd, 1 if is_admin else 0, 1 if history_access else 0)
        )
        conn.commit()
        conn.close()
        return True
    except sqlite3.IntegrityError:
        return False

def get_all_users() -> List[Dict[str, Any]]:
    """Get all active users"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, username, is_admin, created_at, history_access, encrypted_password FROM users WHERE active = 1")
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    for user in users:
        user["history_access"] = bool(user.get("history_access"))
        # Decrypt password if available
        if user.get("encrypted_password"):
            user["password"] = decrypt_password(user["encrypted_password"])
        else:
            user["password"] = ""
        del user["encrypted_password"]  # Remove encrypted version
    return users

def delete_user(username: str) -> bool:
    """Soft delete a user (set active=0)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("UPDATE users SET active = 0 WHERE username = ?", (username,))
    conn.commit()
    conn.close()
    
    return cursor.rowcount > 0

def log_audit(username: str, action: str, table_name: str = None, record_id: str = None, 
              old_value: str = None, new_value: str = None):
    """Log an audit trail entry"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO audit_log (username, action, table_name, record_id, old_value, new_value)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (username, action, table_name, record_id, old_value, new_value))
        
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error logging audit: {e}")

def get_audit_log(limit: int = 1000) -> List[Dict[str, Any]]:
    """Get audit log entries"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = "SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?"
    cursor.execute(query, (limit,))
    
    logs = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return logs

def get_record_history(record_id: str) -> List[Dict[str, Any]]:
    """Get history of changes for a specific record"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT * FROM audit_log 
        WHERE record_id = ? 
        ORDER BY timestamp DESC
    ''', (record_id,))
    
    history = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return history

if __name__ == "__main__":
    init_db()

"""
Local Audit Log Manager
Stores detailed change history as JSON files in the backend
Organized by date and user for efficient retrieval
"""

import json
import os
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional

# Audit logs directory
AUDIT_LOGS_DIR = os.path.join(os.path.dirname(__file__), "audit_logs")

def init_audit_dir():
    """Initialize audit logs directory"""
    Path(AUDIT_LOGS_DIR).mkdir(exist_ok=True)

def get_user_log_file(username: str, date: str) -> str:
    """
    Get the log file path for a user on a specific date
    Format: audit_logs/2026-02-28/pruthvirahshahi.json
    """
    date_dir = os.path.join(AUDIT_LOGS_DIR, date)
    Path(date_dir).mkdir(parents=True, exist_ok=True)
    return os.path.join(date_dir, f"{username}.json")

def get_user_logs(date: str) -> Dict[str, List[Dict[str, Any]]]:
    """Get all logs for all users on a specific date"""
    date_dir = os.path.join(AUDIT_LOGS_DIR, date)
    all_logs = {}
    
    if not os.path.exists(date_dir):
        return all_logs
    
    for filename in os.listdir(date_dir):
        if filename.endswith(".json"):
            username = filename.replace(".json", "")
            filepath = os.path.join(date_dir, filename)
            try:
                with open(filepath, 'r') as f:
                    all_logs[username] = json.load(f)
            except json.JSONDecodeError:
                all_logs[username] = []
    
    return all_logs

def log_change(
    username: str,
    company_code: str,
    record_id: str,
    change_type: str,  # INSERT, UPDATE, DELETE
    field_changes: Optional[List[Dict[str, Any]]] = None,
) -> None:
    """
    Log a change to the audit trail
    
    Args:
        username: User making the change
        company_code: Company code
        record_id: Record ID being changed
        change_type: Type of change (INSERT, UPDATE, DELETE)
        field_changes: List of field changes [{"field": "GLCode", "old": "123", "new": "456"}, ...]
    """
    init_audit_dir()
    
    # Get today's date
    today = datetime.now().strftime("%Y-%m-%d")
    log_file = get_user_log_file(username, today)
    
    # Load existing logs for this user today
    logs = []
    if os.path.exists(log_file):
        try:
            with open(log_file, 'r') as f:
                logs = json.load(f)
        except json.JSONDecodeError:
            logs = []
    
    # Create change entry
    change_entry = {
        "timestamp": datetime.now().isoformat(),
        "company_code": company_code,
        "record_id": record_id,
        "change_type": change_type,
        "field_changes": field_changes or []
    }
    
    logs.append(change_entry)
    
    # Write logs back to file
    with open(log_file, 'w') as f:
        json.dump(logs, f, indent=2)

def get_user_history(
    username: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    company_code: Optional[str] = None,
    record_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Get history for a specific user with optional filters
    
    Args:
        username: Username to get history for
        start_date: Start date (YYYY-MM-DD), defaults to today
        end_date: End date (YYYY-MM-DD), defaults to today
        company_code: Optional filter by company
        record_id: Optional filter by record ID
    
    Returns:
        List of changes sorted by timestamp (newest first)
    """
    init_audit_dir()
    
    if not start_date:
        start_date = datetime.now().strftime("%Y-%m-%d")
    if not end_date:
        end_date = datetime.now().strftime("%Y-%m-%d")
    
    all_changes = []
    
    # Generate date range
    from datetime import timedelta
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    
    current = start
    while current <= end:
        date_str = current.strftime("%Y-%m-%d")
        log_file = get_user_log_file(username, date_str)
        
        if os.path.exists(log_file):
            try:
                with open(log_file, 'r') as f:
                    logs = json.load(f)
                    all_changes.extend(logs)
            except json.JSONDecodeError:
                pass
        
        current += timedelta(days=1)
    
    # Apply filters
    filtered = all_changes
    
    if company_code:
        filtered = [c for c in filtered if c.get("company_code") == company_code]
    
    if record_id:
        filtered = [c for c in filtered if c.get("record_id") == record_id]
    
    # Sort by timestamp (newest first)
    filtered.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    
    return filtered

def get_all_history(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    company_code: Optional[str] = None,
    record_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Get all history (all users) with optional filters
    
    Args:
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)
        company_code: Optional filter by company
        record_id: Optional filter by record ID
    
    Returns:
        List of all changes sorted by timestamp (newest first)
    """
    init_audit_dir()
    
    if not start_date:
        start_date = datetime.now().strftime("%Y-%m-%d")
    if not end_date:
        end_date = datetime.now().strftime("%Y-%m-%d")
    
    all_changes = []
    
    # Iterate through all dates and users
    from datetime import timedelta
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    
    current = start
    while current <= end:
        date_str = current.strftime("%Y-%m-%d")
        user_logs = get_user_logs(date_str)
        
        for username, logs in user_logs.items():
            logs_with_user = [
                {**log, "username": username} 
                for log in logs
            ]
            all_changes.extend(logs_with_user)
        
        current += timedelta(days=1)
    
    # Apply filters
    filtered = all_changes
    
    if company_code:
        filtered = [c for c in filtered if c.get("company_code") == company_code]
    
    if record_id:
        filtered = [c for c in filtered if c.get("record_id") == record_id]
    
    # Sort by timestamp (newest first)
    filtered.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    
    return filtered

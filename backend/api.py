import asyncio
import re

import fastapi
from fastapi import FastAPI, HTTPException, Query, Depends, status, Header
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import pyodbc
import sqlite3
import os
from datetime import datetime
import logging
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from database import init_db, get_db_connection, log_audit as db_log_audit, log_audit as db_log_audit, get_user
from auth import hash_password, verify_password, create_access_token, decode_token
from audit_manager import log_change, get_user_history, get_all_history, list_audit_dates

# Load environment variables from .env
load_dotenv()

# Initialize database
init_db()

# Configure logging
logging.basicConfig(
    filename="api_audit.log",
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)

# FastAPI app
app = FastAPI(
    title="PL Master Data API",
    description="CRUD API for PL Master data management",
    version="1.0.0",
    root_path="/datawaverapi"
)

keepalive_task: Optional[asyncio.Task] = None

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# SQL Server configuration from .env
DB_SERVER = os.getenv('DB_SERVER')
DB_NAME = os.getenv('DB_DATABASE')
DB_USER = os.getenv('DB_USERNAME')
DB_PASSWORD = os.getenv('DB_PASSWORD')

# All columns in PL_Master table
ALL_COLUMNS = [
    'UniqueID', 'GLCode', 'LineItem', 'CompanyCode', 'SiteCode',
    'GrandParent', 'Parent', 'GrandParentCode', 'ParentCode',
    'LineItemCode', 'IsAggregated', 'AggregatedFormula', 'PercentageFormula',
    'ERPSoftware', 'SubNLCode', 'IsCOGS', 'IsSales', 'IsDiscount'
]

# Data type mapping for columns
COLUMN_DTYPES = {
    'UniqueID': 'varchar(255)',
    'GLCode': 'varchar(50)',
    'LineItem': 'varchar(255)',
    'CompanyCode': 'varchar(255)',
    'SiteCode': 'varchar(255)',
    'GrandParent': 'varchar(255)',
    'Parent': 'varchar(255)',
    'GrandParentCode': 'varchar(50)',
    'ParentCode': 'varchar(50)',
    'LineItemCode': 'varchar(50)',
    'IsAggregated': 'bit',
    'AggregatedFormula': 'varchar(MAX)',
    'PercentageFormula': 'varchar(MAX)',
    'ERPSoftware': 'nvarchar(255)',
    'SubNLCode': 'nvarchar(255)',
    'IsCOGS': 'bit',
    'IsSales': 'bit',
    'IsDiscount': 'bit'
}

# Nullable columns (rest are NOT NULL)
NULLABLE_COLUMNS = {
    'GrandParent', 'Parent', 'GrandParentCode', 'ParentCode', 'LineItemCode',
    'IsAggregated', 'AggregatedFormula', 'PercentageFormula', 'ERPSoftware', 'SubNLCode'
}

# Required (NOT NULL) columns
REQUIRED_COLUMNS = {
    'UniqueID', 'GLCode', 'LineItem', 'CompanyCode', 'SiteCode', 'IsCOGS', 'IsSales', 'IsDiscount'
}

# Pydantic models
class PLMasterRecord(BaseModel):
    UniqueID: str
    GLCode: str
    LineItem: str
    CompanyCode: str
    SiteCode: str
    GrandParent: Optional[str] = None
    Parent: Optional[str] = None
    GrandParentCode: Optional[str] = None
    ParentCode: Optional[str] = None
    LineItemCode: Optional[str] = None
    IsAggregated: Optional[int] = None
    AggregatedFormula: Optional[str] = None
    PercentageFormula: Optional[str] = None
    ERPSoftware: Optional[str] = None
    SubNLCode: Optional[str] = None
    IsCOGS: int
    IsSales: int
    IsDiscount: int

class UpsertRequest(BaseModel):
    company_code: str
    records: List[PLMasterRecord]
    deleted_ids: Optional[List[str]] = []

class TargetCompanySite(BaseModel):
    company_code: str
    site_code: str

class CopyChangesRequest(BaseModel):
    source_company_code: str
    source_site_code: str
    targets: List[TargetCompanySite] = Field(default_factory=list)
    confirm_overwrite: Optional[bool] = False

class ColumnInfo(BaseModel):
    column_name: str
    data_type: str
    required: bool

# Auth models
class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    username: str
    role: str
    history_access: bool

class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "user"
    history_access: bool = False

class UpdateUserRequest(BaseModel):
    new_username: Optional[str] = None
    password: Optional[str] = None
    role: str = "user"
    history_access: Optional[bool] = None

class UserResponse(BaseModel):
    username: str
    role: str
    created_at: str
    is_active: bool
    password: Optional[str] = None
    history_access: bool

class AuditLogEntry(BaseModel):
    id: int
    company_code: str
    record_id: str
    username: str
    change_type: str
    field_name: Optional[str]
    old_value: Optional[str]
    new_value: Optional[str]
    timestamp: str

# Helper functions
def get_connection():
    """Create and return a SQL Server connection"""
    try:
        conn_str = (
            "DRIVER={ODBC Driver 18 for SQL Server};"
            f"SERVER={DB_SERVER};"
            f"DATABASE={DB_NAME};"
            f"UID={DB_USER};"
            f"PWD={DB_PASSWORD};"
            "Encrypt=optional;"
            "TrustServerCertificate=yes;"
        )
        conn = pyodbc.connect(conn_str)
        conn.autocommit = False
        return conn
    except Exception as e:
        logging.error(f"Database connection failed: {e}")
        raise e

def get_current_user(authorization: Optional[str] = None):
    """Get current user from JWT token"""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication scheme",
            )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header",
        )
    
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return payload

def safe_val(val):
    """Convert value to SQL-safe format (None for NaN/empty)"""
    if val is None:
        return None
    if isinstance(val, str):
        s = val.strip()
        if s == "" or s.lower() in {"nan", "none", "null"}:
            return None
        return s
    try:
        if pd.isna(val):
            return None
    except:
        return None
    return str(val).strip()

def safe_int(val):
    """Convert value to integer or None"""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
        # Handle actual boolean types
    if isinstance(val, bool):
        return 1 if val else 0
    if isinstance(val, str):
        s = val.strip()
        if s == "" or s.lower() in {"nan", "none", "null"}:
            return None
                # Handle boolean string values
        if s.lower() in {"true", "yes", "1"}:
            return 1
        if s.lower() in {"false", "no", "0"}:
            return 0
        try:
            return int(float(s.replace(",", "")))
        except ValueError:
            return None
    try:
        num = float(val)
        if abs(num - round(num)) < 1e-9:
            return int(round(num))
        return int(num)
    except (ValueError, TypeError):
        return None

def normalize_company_code(company_code: Optional[str]) -> Optional[str]:
    """Normalize company code for API operations."""
    value = safe_val(company_code)
    if value is None:
        return None
    return value.upper()

def is_valid_company_code(company_code: Optional[str]) -> bool:
    """Validate canonical company code format (C followed by digits)."""
    normalized_code = normalize_company_code(company_code)
    if not normalized_code:
        return False
    return bool(re.match(r"^C\d+$", normalized_code))

def extract_company_prefix(company_code: Optional[str]) -> Optional[str]:
    """Extract numeric company prefix used in UniqueID values."""
    normalized_code = normalize_company_code(company_code)
    if not normalized_code:
        return None

    digits = "".join(ch for ch in normalized_code if ch.isdigit())
    if not digits:
        return None

    stripped = digits.lstrip("0")
    return stripped if stripped else "0"

def normalize_unique_prefix(prefix: str) -> str:
    """Normalize prefix fragments so 077 and 77 are treated the same."""
    stripped = prefix.lstrip("0")
    return stripped if stripped else "0"

def parse_unique_id(unique_id: Optional[str]) -> Optional[Dict[str, str]]:
    """Parse UniqueID as prefix + separator + suffix.

    Accept common separators (:, /, \\) used in various UniqueID formats.
    """
    value = safe_val(unique_id)
    if value is None:
        return None

    # allow colon, forward slash or backslash as separator
    match = re.match(r"^([^:/\\]+)([:/\\])(.+)$", value)
    if not match:
        return None

    prefix, separator, suffix = match.groups()
    if not suffix.strip():
        return None

    return {
        "prefix": prefix.strip(),
        "separator": separator,
        "suffix": suffix.strip(),
    }

def remap_unique_id(source_unique_id: Optional[str], source_company_code: str, target_company_code: str) -> Optional[str]:
    """Remap source UniqueID to target company prefix while preserving suffix."""
    # Try structured parse first
    parsed = parse_unique_id(source_unique_id)

    source_prefix = extract_company_prefix(source_company_code)
    target_prefix = extract_company_prefix(target_company_code)

    if source_prefix is None or target_prefix is None:
        return None

    if parsed is not None:
        # parsed.prefix may include a leading 'C' or other chars (e.g., 'C151')
        parsed_prefix_digits = ''.join(ch for ch in parsed['prefix'] if ch.isdigit())
        if not parsed_prefix_digits:
            return None
        parsed_prefix = normalize_unique_prefix(parsed_prefix_digits)
        if parsed_prefix == source_prefix:
            return f"{target_prefix}{parsed['separator']}{parsed['suffix']}"
        # parsed but prefix doesn't match expected source prefix -> invalid
        return None

    # Fallback: try to remap by finding numeric source prefix occurrences in the UniqueID string.
    s = safe_val(source_unique_id)
    if not s:
        return None

    # Try to match an optional leading 'C' + digits (company code) at the start
    try:
        m = re.match(rf"^(C?0*{re.escape(source_prefix)})", s, re.IGNORECASE)
        if m:
            new = re.sub(re.escape(m.group(1)), f"{target_prefix}", s, count=1, flags=re.IGNORECASE)
            return new
    except re.error:
        pass

    # Otherwise find a standalone occurrence of the source_prefix (not surrounded by digits)
    m2 = re.search(rf"(?<!\d){re.escape(source_prefix)}(?!\d)", s)
    if m2:
        new = s[:m2.start()] + target_prefix + s[m2.end():]
        return new

    return None

def sql_literal(value: Any) -> str:
    """Convert python values into SQL literal fragments."""
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    return f"'{str(value).replace(chr(39), chr(39) + chr(39))}'"


async def ping_sql_periodically() -> None:
    """Keep the SQL connection alive by pinging it every 15 minutes."""
    while True:
        try:
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            conn.close()
            logging.debug("SQL keepalive ping succeeded")
        except Exception as exc:
            logging.error(f"SQL keepalive failed: {exc}")
        await asyncio.sleep(900)

# Use log_audit from database module

# ===== API ENDPOINTS =====

@app.get("/")
def read_root():
    """Root endpoint with API info"""
    return {
        "message": "PL Master Data API",
        "version": "1.0.0",
        "endpoints": {
            "GET /records/company/{company_code}": "Fetch all records for a company",
            "GET /records/companies": "List searchable company codes",
            "POST /records/batch-sync": "Upsert records and delete specified rows",
            "POST /records/copy-changes": "Overwrite target companies with source master snapshot",
            "DELETE /records/{unique_id}": "Delete a specific record",
            "GET /schema/columns": "Get column metadata",
            "GET /records/search": "Search records by criteria",
            "GET /health": "Health check"
        }
    }

@app.get("/health")
def health_check():
    """Health check endpoint"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM [MLDataWarehouse].[dbo].[PL_Master]")
        row_count = cursor.fetchone()[0]
        conn.close()
        return {
            "status": "healthy",
            "database": DB_NAME,
            "server": DB_SERVER,
            "pl_master_rows": row_count
        }
    except Exception as e:
        logging.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }

# ===== AUTH ENDPOINTS =====

@app.post("/auth/login", response_model=LoginResponse)
def login(request: LoginRequest):
    """User login endpoint"""
    try:
        # Use the authenticate_user function from database module
        from database import authenticate_user
        
        user = authenticate_user(request.username, request.password)
        if user is None:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        # Determine role based on is_admin flag
        role = "admin" if user['is_admin'] else "user"
        has_history_access = bool(user.get('history_access'))
        access_token = create_access_token(request.username, role, has_history_access)
        logging.info(f"User {request.username} logged in")
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "username": request.username,
            "role": role,
            "history_access": has_history_access,
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Login failed: {e}")
        raise HTTPException(status_code=500, detail="Login failed")

@app.post("/auth/users", response_model=UserResponse)
def create_user(request: CreateUserRequest, authorization: Optional[str] = Header(None)):
    """Create new user (admin only)"""
    current_user = get_current_user(authorization)
    
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create users")
    
    try:
        from database import create_user as db_create_user
        
        is_admin = request.role == "admin"
        success = db_create_user(request.username, request.password, is_admin, request.history_access)
        
        if not success:
            raise HTTPException(status_code=400, detail="Username already exists")
        
        logging.info(f"User {request.username} created by admin {current_user['username']}")
        
        return {
            "username": request.username,
            "role": request.role,
            "created_at": datetime.now().isoformat(),
            "is_active": True,
            "password": request.password,
            "history_access": request.history_access,
        }
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Username already exists")
    except Exception as e:
        logging.error(f"Create user failed: {e}")
        raise HTTPException(status_code=500, detail="Create user failed")

@app.get("/auth/users", response_model=List[UserResponse])
def list_users(authorization: Optional[str] = Header(None)):
    """Get all users (admin only)"""
    current_user = get_current_user(authorization)
    
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view users")
    
    try:
        from database import get_all_users
        
        users_list = get_all_users()
        
        users = []
        for user in users_list:
            role = "admin" if user['is_admin'] else "user"
            users.append({
                "username": user['username'],
                "role": role,
                "created_at": user['created_at'],
                "is_active": True,
                "password": user.get('password', ''),
                "history_access": bool(user.get('history_access')),
            })
        
        return users
    except Exception as e:
        logging.error(f"List users failed: {e}")
        raise HTTPException(status_code=500, detail="List users failed")

@app.delete("/auth/users/{username}")
def delete_user(username: str, authorization: Optional[str] = Header(None)):
    """Delete a user (admin only)"""
    current_user = get_current_user(authorization)
    
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete users")
    
    if username == current_user["username"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    try:
        from database import delete_user as db_delete_user
        
        success = db_delete_user(username)
        if not success:
            raise HTTPException(status_code=404, detail="User not found")
        
        logging.info(f"User {username} deleted by {current_user['username']}")
        return {"status": "success", "message": f"User {username} deleted"}
    except Exception as e:
        logging.error(f"Delete user failed: {e}")
        raise HTTPException(status_code=500, detail=f"Delete user failed: {str(e)}")

@app.put("/auth/users/{username}")
def update_user(username: str, request: UpdateUserRequest, authorization: Optional[str] = Header(None)):
    """Update user password, username, and/or role (admin only)"""
    current_user = get_current_user(authorization)
    
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update users")
    
    try:
        # Get existing user
        user = get_user(username)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        new_username = request.new_username or username
        
        # Update password if provided
        if request.password:
            from database import hash_password, encrypt_password
            password_hash = hash_password(request.password)
            encrypted_pwd = encrypt_password(request.password)
            db = get_db_connection()
            cursor = db.cursor()
            cursor.execute(
                "UPDATE users SET password_hash = ?, encrypted_password = ? WHERE username = ?",
                (password_hash, encrypted_pwd, username)
            )
            db.commit()
            db.close()
        
        # Update username if provided
        if request.new_username and request.new_username != username:
            db = get_db_connection()
            cursor = db.cursor()
            cursor.execute(
                "UPDATE users SET username = ? WHERE username = ?",
                (request.new_username, username)
            )
            db.commit()
            db.close()
        
        # Update role
        is_admin = 1 if request.role == "admin" else 0
        db = get_db_connection()
        cursor = db.cursor()
        cursor.execute(
            "UPDATE users SET is_admin = ? WHERE username = ?",
            (is_admin, new_username)
        )
        db.commit()
        db.close()

        history_access_value = user.get("history_access", 0)
        history_access_bool = bool(history_access_value)
        if request.history_access is not None:
            history_access_value = 1 if request.history_access else 0
            history_access_bool = bool(history_access_value)
            db = get_db_connection()
            cursor = db.cursor()
            cursor.execute(
                "UPDATE users SET history_access = ? WHERE username = ?",
                (history_access_value, new_username)
            )
            db.commit()
            db.close()
        
        logging.info(f"User {username} updated by {current_user['username']}")
        
        # Get updated user to return full info
        updated_user = get_user(new_username)
        
        return {
            "username": new_username,
            "role": request.role,
            "message": "User updated successfully",
            "password": updated_user.get('password', '') if updated_user else '',
            "history_access": history_access_bool,
        }
    except Exception as e:
        logging.error(f"Update user failed: {e}")
        raise HTTPException(status_code=500, detail=f"Update user failed: {str(e)}")

@app.get("/schema/columns")
def get_columns():
    """Get all column information"""
    columns = []
    for col in ALL_COLUMNS:
        columns.append({
            "column_name": col,
            "data_type": COLUMN_DTYPES.get(col, "string"),
            "required": col not in NULLABLE_COLUMNS
        })
    return {"columns": columns}

@app.get("/records/company/{company_code}")
def fetch_data(company_code: str, authorization: Optional[str] = Header(None)):
    """Fetch all records for a given CompanyCode"""
    current_user = get_current_user(authorization)
    
    try:
        conn = get_connection()
        query = f"""
            SELECT * FROM [MLDataWarehouse].[dbo].[PL_Master]
            WHERE CompanyCode = '{company_code}'
            ORDER BY CASE WHEN GrandParentCode IS NULL OR ParentCode IS NULL OR LineItemCode IS NULL THEN 1 ELSE 0 END,
                     CASE WHEN TRY_CONVERT(DECIMAL(18,4), GrandParentCode) IS NULL THEN 1 ELSE 0 END,
                     TRY_CONVERT(DECIMAL(18,4), GrandParentCode), GrandParentCode,
                     CASE WHEN TRY_CONVERT(DECIMAL(18,4), ParentCode) IS NULL THEN 1 ELSE 0 END,
                     TRY_CONVERT(DECIMAL(18,4), ParentCode), ParentCode,
                     CASE WHEN TRY_CONVERT(DECIMAL(18,4), LineItemCode) IS NULL THEN 1 ELSE 0 END,
                     TRY_CONVERT(DECIMAL(18,4), LineItemCode), LineItemCode
        """
        df = pd.read_sql(query, conn)
        conn.close()
        
        if df.empty:
            return {
                "status": "success",
                "company_code": company_code,
                "record_count": 0,
                "records": []
            }
        
        records = df.to_dict(orient='records')
        logging.info(f"Fetched {len(records)} records for {company_code} by user {current_user['username']}")
        
        return {
            "status": "success",
            "company_code": company_code,
            "record_count": len(records),
            "records": records
        }
    except Exception as e:
        logging.error(f"Failed to fetch data for {company_code}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch data: {str(e)}")

@app.get("/records/companies")
def list_company_codes(
    query: Optional[str] = None,
    source_company_code: Optional[str] = None,
    source_site_code: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    """List existing company/site combinations from PL_Master data."""
    current_user = get_current_user(authorization)

    try:
        conn = get_connection()
        cursor = conn.cursor()

        # Get only EXISTING company/site combinations from actual data
        sql = """
            SELECT DISTINCT CompanyCode, SiteCode
            FROM [MLDataWarehouse].[dbo].[PL_Master]
            WHERE CompanyCode IS NOT NULL AND LTRIM(RTRIM(CompanyCode)) <> ''
            AND SiteCode IS NOT NULL AND LTRIM(RTRIM(SiteCode)) <> ''
            ORDER BY CompanyCode, SiteCode
        """

        cursor.execute(sql)
        all_rows = cursor.fetchall()
        
        company_sites = []
        for row in all_rows:
            cc = safe_val(row[0])
            sc = safe_val(row[1])
            if cc and sc:
                company_sites.append({"company_code": cc, "site_code": sc})

        # Apply search filter
        cleaned_query = safe_val(query)
        if cleaned_query:
            company_sites = [
                cs for cs in company_sites
                if cleaned_query.upper() in cs["company_code"].upper() 
                   or cleaned_query.upper() in cs["site_code"].upper()
            ]

        # Apply source exclusion filter
        normalized_source = normalize_company_code(source_company_code)
        if normalized_source and source_site_code:
            normalized_sc = source_site_code.strip()
            company_sites = [
                cs for cs in company_sites
                if not (cs["company_code"] == normalized_source and cs["site_code"] == normalized_sc)
            ]
        elif normalized_source:
            company_sites = [cs for cs in company_sites if cs["company_code"] != normalized_source]
        
        conn.close()

        return {
            "status": "success",
            "query": cleaned_query,
            "source_company_code": normalized_source,
            "source_site_code": source_site_code,
            "count": len(company_sites),
            "company_sites": company_sites,
            "company_codes": company_sites,
        }
    except Exception as e:
        logging.error(f"Failed to list company codes for {current_user['username']}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list company codes: {str(e)}")

@app.post("/records/create-company-site")
def create_company_site(
    company_code: str = Query(...),
    site_code: str = Query(...),
    authorization: Optional[str] = Header(None),
):
    """Create a new company/site combination table by inserting a placeholder row."""
    current_user = get_current_user(authorization)
    username = current_user["username"]

    try:
        normalized_cc = normalize_company_code(company_code)
        normalized_sc = site_code.strip().upper()

        if not normalized_cc or not normalized_sc:
            raise HTTPException(status_code=400, detail="Invalid company code or site code format")

        conn = get_connection()
        cursor = conn.cursor()

        # Check if combination already exists
        check_sql = """
            SELECT COUNT(*) FROM [MLDataWarehouse].[dbo].[PL_Master]
            WHERE CompanyCode = ? AND SiteCode = ?
        """
        cursor.execute(check_sql, (normalized_cc, normalized_sc))
        count = cursor.fetchone()[0]

        if count > 0:
            conn.close()
            raise HTTPException(status_code=400, detail=f"{normalized_cc}:{normalized_sc} already exists")

        # Insert a placeholder row to create the table entry
        unique_id = f"{normalized_cc}:{normalized_sc}:PLACEHOLDER:{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"
        insert_sql = """
            INSERT INTO [MLDataWarehouse].[dbo].[PL_Master]
            (UniqueID, GLCode, LineItem, CompanyCode, SiteCode, IsCOGS, IsSales, IsDiscount)
            VALUES (?, ?, ?, ?, ?, 0, 0, 0)
        """
        cursor.execute(
            insert_sql,
            (unique_id, "PLACEHOLDER", "Placeholder", normalized_cc, normalized_sc),
        )
        conn.commit()
        conn.close()

        return {
            "status": "success",
            "message": f"Created new table for {normalized_cc}:{normalized_sc}",
            "company_code": normalized_cc,
            "site_code": normalized_sc,
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to create company/site for {username}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create company/site: {str(e)}")

@app.post("/records/copy-changes")
def copy_changes(request: CopyChangesRequest, authorization: Optional[str] = Header(None)):
    """Copy latest saved source master to targets by fully replacing target snapshots for company/site combinations."""
    current_user = get_current_user(authorization)
    username = current_user["username"]

    source_company_code = normalize_company_code(request.source_company_code)
    if not source_company_code or not is_valid_company_code(source_company_code):
        raise HTTPException(status_code=400, detail="Valid source_company_code is required (format: C+digits)")
    
    source_site_code = request.source_site_code.strip() if request.source_site_code else None
    if not source_site_code:
        raise HTTPException(status_code=400, detail="source_site_code is required")

    deduped_targets: List[TargetCompanySite] = []
    for target in request.targets:
        normalized_cc = normalize_company_code(target.company_code)
        normalized_sc = target.site_code.strip() if target.site_code else ""
        if not normalized_cc or not normalized_sc:
            continue
        if normalized_cc == source_company_code and normalized_sc == source_site_code:
            continue
        if not is_valid_company_code(normalized_cc):
            continue
        if not any(t.company_code == normalized_cc and t.site_code == normalized_sc for t in deduped_targets):
            deduped_targets.append(TargetCompanySite(company_code=normalized_cc, site_code=normalized_sc))

    if not deduped_targets:
        raise HTTPException(status_code=400, detail="At least one valid target company code and site code combination is required")

    source_prefix = extract_company_prefix(source_company_code)
    if source_prefix is None:
        raise HTTPException(status_code=400, detail="Invalid source company code")

    conn = None
    targets_summary: List[Dict[str, Any]] = []

    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
                SELECT UniqueID, GLCode, LineItem, CompanyCode, SiteCode, GrandParent, Parent,
                       GrandParentCode, ParentCode, LineItemCode, IsAggregated, AggregatedFormula,
                       PercentageFormula, ERPSoftware, SubNLCode, IsCOGS, IsSales, IsDiscount
                FROM [MLDataWarehouse].[dbo].[PL_Master]
                WHERE CompanyCode = ? AND SiteCode = ?
            """,
            (source_company_code, source_site_code),
        )
        source_rows = cursor.fetchall()
        source_columns = [col[0] for col in cursor.description] if cursor.description else []

        if not source_rows:
            raise HTTPException(
                status_code=400,
                detail=f"Source company {source_company_code} and site {source_site_code} has no saved master rows to copy",
            )

        for target in deduped_targets:
            target_company_code = target.company_code
            target_site_code = target.site_code
            target_summary: Dict[str, Any] = {
                "target_company_code": target_company_code,
                "target_site_code": target_site_code,
                "inserted": 0,
                "deleted_existing": 0,
                "skipped_invalid_ids": [],
                "errors": [],
                "source_row_count": len(source_rows),
            }

            target_prefix = extract_company_prefix(target_company_code)
            if target_prefix is None:
                target_summary["errors"].append(f"Invalid target company code: {target_company_code}")
                targets_summary.append(target_summary)
                continue

            try:
                prepared_rows: List[List[Any]] = []

                for source_row in source_rows:
                    row_data = dict(zip(source_columns, source_row))
                    source_unique_id = safe_val(row_data.get("UniqueID"))
                    remapped_unique_id = remap_unique_id(source_unique_id, source_company_code, target_company_code)

                    if remapped_unique_id is None:
                        reason = "remap_failed"
                        logging.info(f"Skipping source row: UniqueID={source_unique_id} reason={reason} source_row={row_data}")
                        target_summary["skipped_invalid_ids"].append(source_unique_id or "")
                        continue

                    gl_code = safe_val(row_data.get("GLCode"))
                    line_item = safe_val(row_data.get("LineItem"))
                    grandparent = safe_val(row_data.get("GrandParent"))
                    parent = safe_val(row_data.get("Parent"))
                    grandparent_code = safe_val(row_data.get("GrandParentCode"))
                    parent_code = safe_val(row_data.get("ParentCode"))
                    line_item_code = safe_val(row_data.get("LineItemCode"))
                    is_aggregated = safe_int(row_data.get("IsAggregated"))
                    agg_formula = safe_val(row_data.get("AggregatedFormula"))
                    pct_formula = safe_val(row_data.get("PercentageFormula"))
                    erp_software = safe_val(row_data.get("ERPSoftware"))
                    sub_nl_code = safe_val(row_data.get("SubNLCode"))
                    is_cogs = safe_int(row_data.get("IsCOGS"))
                    is_sales = safe_int(row_data.get("IsSales"))
                    is_discount = safe_int(row_data.get("IsDiscount"))

                    if not all([
                        remapped_unique_id,
                        gl_code,
                        line_item,
                        target_company_code,
                        target_site_code,
                        is_cogs is not None,
                        is_sales is not None,
                        is_discount is not None,
                    ]):
                        reason = []
                        if not gl_code:
                            reason.append('missing_GLCode')
                        if not line_item:
                            reason.append('missing_LineItem')
                        if is_cogs is None or is_sales is None or is_discount is None:
                            reason.append('missing_boolean_flags')
                        reason_str = ','.join(reason) if reason else 'invalid_required_fields'
                        logging.info(f"Skipping source row: UniqueID={source_unique_id} reason={reason_str} source_row={row_data}")
                        target_summary["errors"].append(
                            f"Invalid required fields for source UniqueID {source_unique_id or 'UNKNOWN'}: {reason_str}"
                        )
                        continue

                    prepared_rows.append([
                        remapped_unique_id,
                        gl_code,
                        line_item,
                        target_company_code,
                        target_site_code,
                        grandparent,
                        parent,
                        grandparent_code,
                        parent_code,
                        line_item_code,
                        is_aggregated,
                        agg_formula,
                        pct_formula,
                        erp_software,
                        sub_nl_code,
                        is_cogs,
                        is_sales,
                        is_discount,
                    ])

                # If there are no valid rows to insert, skip this target.
                if not prepared_rows:
                    logging.info(f"No valid prepared rows for target {target_company_code}/{target_site_code}. source_rows={len(source_rows)} skipped={len(target_summary['skipped_invalid_ids'])} errors={len(target_summary['errors'])}")
                    targets_summary.append(target_summary)
                    continue

                # Log prepared rows summary and sample remapped UniqueIDs
                sample_uids = [r[0] for r in prepared_rows[:20]]
                logging.info(f"Prepared {len(prepared_rows)} rows for target {target_company_code}/{target_site_code}. sample_uids={sample_uids}")

                # Conflict preflight: check whether any remapped UniqueIDs already exist in the target
                remapped_ids = {r[0] for r in prepared_rows}
                cursor.execute(
                    "SELECT UniqueID FROM [MLDataWarehouse].[dbo].[PL_Master] WHERE CompanyCode = ? AND SiteCode = ?",
                    (target_company_code, target_site_code),
                )
                existing_uids = {safe_val(r[0]) for r in cursor.fetchall()}

                conflicts = sorted(list(remapped_ids & existing_uids))
                if conflicts and not request.confirm_overwrite:
                    logging.info(f"Conflicts detected for target {target_company_code}/{target_site_code}: {conflicts[:20]}")
                    # Return conflict details for caller to confirm overwrite
                    target_summary["conflicts"] = conflicts
                    targets_summary.append(target_summary)

                    # Build a detailed response describing conflicts across targets
                    conflict_response = {
                        "status": "conflict",
                        "message": "Conflicting UniqueIDs detected for target(s). Call again with confirm_overwrite=true to clear and proceed.",
                        "targets": [t for t in targets_summary],
                    }
                    raise HTTPException(status_code=409, detail=conflict_response)

                # If confirm_overwrite is true, delete only conflicting rows first
                if conflicts and request.confirm_overwrite:
                    # Delete only the conflicting UniqueIDs for this target
                    # Build parameterized query in chunks to avoid excessively long SQL
                    params = []
                    placeholders = []
                    for uid in conflicts:
                        params.append(uid)
                        placeholders.append("?")
                    delete_sql = f"DELETE FROM [MLDataWarehouse].[dbo].[PL_Master] WHERE CompanyCode = ? AND SiteCode = ? AND UniqueID IN ({', '.join(placeholders)})"
                    cursor.execute(delete_sql, (target_company_code, target_site_code, *params))
                    logging.info(f"Deleted {len(conflicts)} conflicting UniqueIDs for {target_company_code}/{target_site_code}")

                cursor.execute(
                    "SELECT COUNT(*) FROM [MLDataWarehouse].[dbo].[PL_Master] WHERE CompanyCode = ? AND SiteCode = ?",
                    (target_company_code, target_site_code),
                )
                existing_count = cursor.fetchone()[0] or 0
                target_summary["deleted_existing"] = existing_count

                cursor.execute(
                    "DELETE FROM [MLDataWarehouse].[dbo].[PL_Master] WHERE CompanyCode = ? AND SiteCode = ?",
                    (target_company_code, target_site_code),
                )

                cursor.executemany(
                    """
                        INSERT INTO [MLDataWarehouse].[dbo].[PL_Master]
                        (UniqueID, GLCode, LineItem, CompanyCode, SiteCode, GrandParent, Parent,
                         GrandParentCode, ParentCode, LineItemCode, IsAggregated, AggregatedFormula,
                         PercentageFormula, ERPSoftware, SubNLCode, IsCOGS, IsSales, IsDiscount)
                        VALUES
                        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    prepared_rows,
                )

                target_summary["inserted"] = len(prepared_rows)

                conn.commit()

                # Log post-insert sample from target to validate content
                try:
                    cursor.execute(
                        "SELECT TOP 10 UniqueID, GLCode, LineItem, CompanyCode, SiteCode FROM [MLDataWarehouse].[dbo].[PL_Master] WHERE CompanyCode = ? AND SiteCode = ? ORDER BY UniqueID",
                        (target_company_code, target_site_code),
                    )
                    post_rows = cursor.fetchall()
                    logging.info(f"Post-insert sample for {target_company_code}/{target_site_code}: {post_rows[:10]}")
                except Exception as e:
                    logging.error(f"Failed to fetch post-insert sample for {target_company_code}/{target_site_code}: {e}")

                log_change(
                    username=username,
                    company_code=target_company_code,
                    record_id=f"{target_company_code}\\{target_site_code}",
                    change_type="COPY_OVERWRITE_DONE",
                    field_changes=[
                        {"field": "source_company_code", "old": None, "new": source_company_code},
                        {"field": "source_site_code", "old": None, "new": source_site_code},
                        {"field": "target_site_code", "old": None, "new": target_site_code},
                        {"field": "deleted_existing", "old": str(existing_count), "new": "0"},
                        {"field": "inserted", "old": "0", "new": str(len(prepared_rows))},
                    ],
                )
                db_log_audit(
                    username,
                    "COPY_OVERWRITE",
                    f"{target_company_code}\\{target_site_code}",
                    f"{target_company_code}\\{target_site_code}",
                    str(existing_count),
                    str(len(prepared_rows)),
                )

            except Exception as target_error:
                conn.rollback()
                target_summary["errors"].append(str(target_error))
                logging.error(
                    f"Copy changes failed for source {source_company_code}/{source_site_code} -> target {target_company_code}/{target_site_code}: {target_error}"
                )

            targets_summary.append(target_summary)

        totals = {
            "inserted": sum(target["inserted"] for target in targets_summary),
            "deleted_existing": sum(target["deleted_existing"] for target in targets_summary),
            "skipped_invalid_ids": sum(len(target["skipped_invalid_ids"]) for target in targets_summary),
            "errors": sum(len(target["errors"]) for target in targets_summary),
            "replaced_targets": sum(1 for target in targets_summary if len(target["errors"]) == 0),
        }

        status_text = "success" if totals["errors"] == 0 else "partial_success"

        logging.info(
            f"Copy changes by {username}: source={source_company_code}/{source_site_code}, targets={len(deduped_targets)}, "
            f"inserted={totals['inserted']}, deleted_existing={totals['deleted_existing']}, "
            f"replaced_targets={totals['replaced_targets']}"
        )

        return {
            "status": status_text,
            "source_company_code": source_company_code,
            "source_site_code": source_site_code,
            "total_targets": len(deduped_targets),
            "totals": totals,
            "targets": targets_summary,
        }

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Copy changes failed for source {source_company_code}/{source_site_code}: {e}")
        raise HTTPException(status_code=500, detail=f"Copy changes failed: {str(e)}")
    finally:
        if conn is not None:
            conn.close()

@app.post("/records/batch-sync")
def upsert_data(request: UpsertRequest, authorization: Optional[str] = Header(None)):
    """Upsert records and delete specified rows"""
    current_user = get_current_user(authorization)
    company_code = request.company_code
    records = request.records
    deleted_ids = request.deleted_ids or []
    username = current_user['username']
    
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Get existing records for comparison
        cursor.execute(
            f"SELECT UniqueID FROM [MLDataWarehouse].[dbo].[PL_Master] WHERE CompanyCode = '{company_code}'"
        )
        existing_ids = {row[0] for row in cursor.fetchall()}
        
        # Get existing data for change tracking
        cursor.execute(
            f"SELECT UniqueID, * FROM [MLDataWarehouse].[dbo].[PL_Master] WHERE CompanyCode = '{company_code}'"
        )
        existing_data = {row[0]: row for row in cursor.fetchall()}
        
        inserted = 0
        updated = 0
        errors = []
        
        # Upsert records
        for idx, record in enumerate(records):
            try:
                unique_id = safe_val(record.UniqueID)
                gl_code = safe_val(record.GLCode)
                line_item = safe_val(record.LineItem)
                company_code_val = safe_val(record.CompanyCode)
                site_code = safe_val(record.SiteCode)
                grandparent = safe_val(record.GrandParent)
                parent = safe_val(record.Parent)
                grandparent_code = safe_val(record.GrandParentCode)
                parent_code = safe_val(record.ParentCode)
                line_item_code = safe_val(record.LineItemCode)
                is_aggregated = safe_int(record.IsAggregated)
                agg_formula = safe_val(record.AggregatedFormula)
                pct_formula = safe_val(record.PercentageFormula)
                erp_software = safe_val(record.ERPSoftware)
                sub_nl_code = safe_val(record.SubNLCode)
                is_cogs = safe_int(record.IsCOGS)
                is_sales = safe_int(record.IsSales)
                is_discount = safe_int(record.IsDiscount)
                
                # Validate required fields
                if not all([unique_id, gl_code, line_item, company_code_val, site_code, 
                           is_cogs is not None, is_sales is not None, is_discount is not None]):
                    errors.append(f"Record {idx + 1}: Missing required fields")
                    continue
                
                def sql_val(v):
                    if v is None:
                        return "NULL"
                    if isinstance(v, (int, float)):
                        return str(v)
                    return f"'{str(v).replace(chr(39), chr(39) + chr(39))}'"
                
                if unique_id in existing_ids:
                    # UPDATE - capture field changes
                    field_changes = []
                    
                    # Compare each field with existing
                    field_mapping = {
                        'GLCode': gl_code,
                        'LineItem': line_item,
                        'SiteCode': site_code,
                        'GrandParent': grandparent,
                        'Parent': parent,
                        'GrandParentCode': grandparent_code,
                        'ParentCode': parent_code,
                        'LineItemCode': line_item_code,
                        'IsAggregated': is_aggregated,
                        'AggregatedFormula': agg_formula,
                        'PercentageFormula': pct_formula,
                        'ERPSoftware': erp_software,
                        'SubNLCode': sub_nl_code,
                        'IsCOGS': is_cogs,
                        'IsSales': is_sales,
                        'IsDiscount': is_discount,
                    }
                    
                    # Fetch existing record for comparison
                    cursor.execute(
                        f"SELECT * FROM [MLDataWarehouse].[dbo].[PL_Master] WHERE UniqueID = {sql_val(unique_id)}"
                    )
                    existing_row = cursor.fetchone()
                    
                    existing_values = {}
                    if existing_row:
                        columns = [col[0] for col in cursor.description]
                        existing_values = dict(zip(columns, existing_row))

                    for field_name, new_value in field_mapping.items():
                        old_value = existing_values.get(field_name)
                        
                        if old_value != new_value:
                            field_changes.append({
                                "field": field_name,
                                "old": str(old_value) if old_value is not None else None,
                                "new": str(new_value) if new_value is not None else None
                            })
                    
                    update_query = f"""
                        UPDATE [MLDataWarehouse].[dbo].[PL_Master]
                        SET
                            GLCode = {sql_val(gl_code)},
                            LineItem = {sql_val(line_item)},
                            SiteCode = {sql_val(site_code)},
                            GrandParent = {sql_val(grandparent)},
                            Parent = {sql_val(parent)},
                            GrandParentCode = {sql_val(grandparent_code)},
                            ParentCode = {sql_val(parent_code)},
                            LineItemCode = {sql_val(line_item_code)},
                            IsAggregated = {is_aggregated},
                            AggregatedFormula = {sql_val(agg_formula)},
                            PercentageFormula = {sql_val(pct_formula)},
                            ERPSoftware = {sql_val(erp_software)},
                            SubNLCode = {sql_val(sub_nl_code)},
                            IsCOGS = {is_cogs},
                            IsSales = {is_sales},
                            IsDiscount = {is_discount}
                        WHERE UniqueID = {sql_val(unique_id)} AND CompanyCode = '{company_code}'
                    """
                    cursor.execute(update_query)
                    
                    # Log detailed field changes
                    if field_changes:
                        log_change(
                            username=username,
                            company_code=company_code,
                            record_id=unique_id,
                            change_type="UPDATE",
                            field_changes=field_changes
                        )
                    
                    # Also log in database for backward compatibility
                    db_log_audit(username, "UPDATE", company_code, unique_id)
                    updated += 1
                else:
                    # INSERT - log all fields as new
                    field_changes = [
                        {"field": "GLCode", "old": None, "new": str(gl_code)},
                        {"field": "LineItem", "old": None, "new": str(line_item)},
                        {"field": "SiteCode", "old": None, "new": str(site_code)},
                        {"field": "GrandParent", "old": None, "new": str(grandparent) if grandparent else None},
                        {"field": "Parent", "old": None, "new": str(parent) if parent else None},
                        {"field": "GrandParentCode", "old": None, "new": str(grandparent_code) if grandparent_code else None},
                        {"field": "ParentCode", "old": None, "new": str(parent_code) if parent_code else None},
                        {"field": "LineItemCode", "old": None, "new": str(line_item_code) if line_item_code else None},
                        {"field": "IsAggregated", "old": None, "new": str(is_aggregated) if is_aggregated is not None else None},
                        {"field": "AggregatedFormula", "old": None, "new": str(agg_formula) if agg_formula else None},
                        {"field": "PercentageFormula", "old": None, "new": str(pct_formula) if pct_formula else None},
                        {"field": "ERPSoftware", "old": None, "new": str(erp_software) if erp_software else None},
                        {"field": "SubNLCode", "old": None, "new": str(sub_nl_code) if sub_nl_code else None},
                        {"field": "IsCOGS", "old": None, "new": str(is_cogs)},
                        {"field": "IsSales", "old": None, "new": str(is_sales)},
                        {"field": "IsDiscount", "old": None, "new": str(is_discount)},
                    ]
                    
                    insert_query = f"""
                        INSERT INTO [MLDataWarehouse].[dbo].[PL_Master]
                        (UniqueID, GLCode, LineItem, CompanyCode, SiteCode, GrandParent, Parent,
                         GrandParentCode, ParentCode, LineItemCode, IsAggregated, AggregatedFormula,
                         PercentageFormula, ERPSoftware, SubNLCode, IsCOGS, IsSales, IsDiscount)
                        VALUES
                        ({sql_val(unique_id)}, {sql_val(gl_code)}, {sql_val(line_item)}, {sql_val(company_code_val)},
                         {sql_val(site_code)}, {sql_val(grandparent)}, {sql_val(parent)},
                         {sql_val(grandparent_code)}, {sql_val(parent_code)}, {sql_val(line_item_code)},
                         {sql_val(is_aggregated)}, {sql_val(agg_formula)}, {sql_val(pct_formula)},
                         {sql_val(erp_software)}, {sql_val(sub_nl_code)}, {sql_val(is_cogs)}, {sql_val(is_sales)}, {sql_val(is_discount)})
                    """
                    cursor.execute(insert_query)
                    
                    # Log detailed field changes
                    log_change(
                        username=username,
                        company_code=company_code,
                        record_id=unique_id,
                        change_type="INSERT",
                        field_changes=field_changes
                    )
                    
                    # Also log in database for backward compatibility
                    db_log_audit(username, "INSERT", company_code, unique_id)
                    inserted += 1
            
            except Exception as e:
                errors.append(f"Record {idx + 1}: {str(e)}")
                logging.error(f"Upsert error at record {idx + 1}: {e}")
        
        # Delete rows
        deleted = 0
        for unique_id in deleted_ids:
            try:
                delete_query = f"""
                    DELETE FROM [MLDataWarehouse].[dbo].[PL_Master]
                    WHERE UniqueID = '{unique_id}' AND CompanyCode = '{company_code}'
                """
                cursor.execute(delete_query)
                
                # Log deletion
                db_log_audit(username, "DELETE", company_code, unique_id)
                deleted += 1
            except Exception as e:
                errors.append(f"Delete {unique_id}: {str(e)}")
                logging.error(f"Delete error for {unique_id}: {e}")
        
        conn.commit()
        conn.close()
        
        logging.info(f"Upsert for {company_code} by {username}: Inserted={inserted}, Updated={updated}, Deleted={deleted}")
        
        if errors:
            return {
                "status": "partial_success",
                "company_code": company_code,
                "inserted": inserted,
                "updated": updated,
                "deleted": deleted,
                "errors": errors
            }
        else:
            return {
                "status": "success",
                "company_code": company_code,
                "inserted": inserted,
                "updated": updated,
                "deleted": deleted
            }
    
    except Exception as e:
        logging.error(f"Upsert failed for {company_code}: {e}")
        raise HTTPException(status_code=500, detail=f"Upsert failed: {str(e)}")

@app.delete("/records/{unique_id}")
def delete_record(unique_id: str, company_code: str = Query(...), authorization: Optional[str] = Header(None)):
    """Delete a specific record by UniqueID"""
    current_user = get_current_user(authorization)
    
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        delete_query = f"""
            DELETE FROM [MLDataWarehouse].[dbo].[PL_Master]
            WHERE UniqueID = '{unique_id}' AND CompanyCode = '{company_code}'
        """
        cursor.execute(delete_query)
        conn.commit()
        
        if cursor.rowcount > 0:
            conn.close()
            db_log_audit(current_user['username'], "DELETE", company_code, unique_id)
            logging.info(f"Deleted record {unique_id} from {company_code} by {current_user['username']}")
            return {
                "status": "success",
                "message": f"Record {unique_id} deleted",
                "deleted_rows": cursor.rowcount
            }
        else:
            conn.close()
            raise HTTPException(status_code=404, detail=f"Record {unique_id} not found")
    
    except Exception as e:
        logging.error(f"Delete failed for {unique_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")

@app.get("/records/search")
def search_records(
    company_code: Optional[str] = None,
    gl_code: Optional[str] = None,
    line_item: Optional[str] = None,
    authorization: Optional[str] = Header(None)
):
    """Search records by multiple criteria"""
    current_user = get_current_user(authorization)
    
    try:
        conn = get_connection()
        
        query = "SELECT * FROM [MLDataWarehouse].[dbo].[PL_Master] WHERE 1=1"
        
        if company_code:
            query += f" AND CompanyCode = '{company_code}'"
        if gl_code:
            query += f" AND GLCode = '{gl_code}'"
        if line_item:
            query += f" AND LineItem LIKE '%{line_item}%'"
        
        query += " ORDER BY UniqueID"
        
        df = pd.read_sql(query, conn)
        conn.close()
        
        records = df.to_dict(orient='records') if not df.empty else []
        
        return {
            "status": "success",
            "record_count": len(records),
            "records": records
        }
    
    except Exception as e:
        logging.error(f"Search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

# ===== AUDIT/HISTORY ENDPOINTS =====

@app.get("/audit/history")
def get_audit_history(company_code: str, authorization: Optional[str] = Header(None)):
    """Get audit history for a company"""
    current_user = get_current_user(authorization)
    
    try:
        db = get_db_connection()
        cursor = db.cursor()
        
        # Query the audit_log table - note: table_name stores the company code
        cursor.execute(
            """SELECT id, username, action, table_name, record_id, old_value, new_value, timestamp
               FROM audit_log
               WHERE table_name = ?
               ORDER BY timestamp DESC""",
            (company_code,)

        )
        rows = cursor.fetchall()
        db.close()
        
        logs = []
        serial = 1
        for row in rows:
            logs.append({
                "serial": serial,
                "id": row[0],
                "username": row[1],
                "action": row[2],
                "table_name": row[3],
                "record_id": row[4],
                "old_value": row[5],
                "new_value": row[6],
                "timestamp": row[7]
            })
            serial += 1
        
        return {
            "status": "success",
            "count": len(logs),
            "logs": logs
        }
    except Exception as e:
        logging.error(f"Get audit history failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get history: {str(e)}")

@app.on_event("startup")
async def start_keepalive_task():
    """Launch the keepalive ping when the application starts."""
    global keepalive_task
    if keepalive_task is None:
        keepalive_task = asyncio.create_task(ping_sql_periodically())


@app.on_event("shutdown")
async def stop_keepalive_task():
    """Cancel the keepalive ping when the application shuts down."""
    if keepalive_task:
        keepalive_task.cancel()
        try:
            await keepalive_task
        except asyncio.CancelledError:
            pass



@app.get("/audit/record/{record_id}")
def get_record_history(record_id: str, authorization: Optional[str] = Header(None)):
    """Get audit history for a specific record"""
    current_user = get_current_user(authorization)
    
    try:
        db = get_db_connection()
        cursor = db.cursor()
        
        cursor.execute(
            """SELECT id, company_code, record_id, username, change_type, field_name, old_value, new_value, timestamp
               FROM audit_logs
               WHERE record_id = ?
               ORDER BY timestamp DESC""",
            (record_id,)
        )
        rows = cursor.fetchall()
        db.close()
        
        logs = []
        serial = 1
        for row in rows:
            logs.append({
                "serial": serial,
                "id": row[0],
                "company_code": row[1],
                "record_id": row[2],
                "username": row[3],
                "change_type": row[4],
                "field_name": row[5],
                "old_value": row[6],
                "new_value": row[7],
                "timestamp": row[8]
            })
            serial += 1
        
        return {
            "status": "success",
            "count": len(logs),
            "logs": logs
        }
    except Exception as e:
        logging.error(f"Get record history failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get history: {str(e)}")

@app.get("/audit/user-history")
def get_current_user_history(
    authorization: Optional[str] = Header(None),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    company_code: Optional[str] = None,
    record_id: Optional[str] = None
):
    """Get history for the currently logged-in user from local audit logs"""
    current_user = get_current_user(authorization)
    username = current_user['username']
    
    try:
        # Get user history from local JSON files
        history = get_user_history(
            username=username,
            start_date=start_date,
            end_date=end_date,
            company_code=company_code,
            record_id=record_id
        )
        
        # Format for frontend
        formatted = []
        for idx, change in enumerate(history, 1):
            formatted.append({
                "serial": idx,
                "id": idx,
                "timestamp": change.get("timestamp"),
                "username": username,
                "company_code": change.get("company_code"),
                "record_id": change.get("record_id"),
                "change_type": change.get("change_type"),
                "field_changes": change.get("field_changes", [])
            })
        
        logging.info(f"User {username} retrieved {len(formatted)} history records")
        
        return {
            "status": "success",
            "count": len(formatted),
            "logs": formatted
        }
    except Exception as e:
        logging.error(f"Get user history failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get history: {str(e)}")

@app.get("/audit/all-history")
def get_all_audit_history(
    authorization: Optional[str] = Header(None),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    company_code: Optional[str] = None,
    record_id: Optional[str] = None
):
    """Get all history (admin only) from local audit logs"""
    current_user = get_current_user(authorization)
    
    # Admin or history_access check
    if current_user.get("role") != "admin" and not current_user.get("history_access"):
        raise HTTPException(status_code=403, detail="Only admins or history-access users can view all history")
    
    try:
        # Get all history from local JSON files
        history = get_all_history(
            start_date=start_date,
            end_date=end_date,
            company_code=company_code,
            record_id=record_id
        )
        
        # Format for frontend
        formatted = []
        for idx, change in enumerate(history, 1):
            formatted.append({
                "serial": idx,
                "id": idx,
                "timestamp": change.get("timestamp"),
                "username": change.get("username"),
                "company_code": change.get("company_code"),
                "record_id": change.get("record_id"),
                "change_type": change.get("change_type"),
                "field_changes": change.get("field_changes", [])
            })
        
        logging.info(f"Admin {current_user['username']} retrieved all {len(formatted)} history records")
        
        return {
            "status": "success",
            "count": len(formatted),
            "logs": formatted
        }
    except Exception as e:
        logging.error(f"Get all history failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get history: {str(e)}")


@app.get("/audit/dates")
def get_audit_dates(authorization: Optional[str] = Header(None)):
    """Return the list of date folders available in audit_logs"""
    current_user = get_current_user(authorization)

    try:
        dates = list_audit_dates()
        return {
            "status": "success",
            "dates": dates
        }
    except Exception as e:
        logging.error(f"Get audit dates failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to get history dates")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="10.200.7.77", port=8015)

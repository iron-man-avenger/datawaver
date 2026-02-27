import fastapi
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import pyodbc
import os
from datetime import datetime
import logging
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

# Load environment variables from .env
load_dotenv()

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

class ColumnInfo(BaseModel):
    column_name: str
    data_type: str
    required: bool

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
    if isinstance(val, str):
        s = val.strip()
        if s == "" or s.lower() in {"nan", "none", "null"}:
            return None
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

# ===== API ENDPOINTS =====

@app.get("/")
def read_root():
    """Root endpoint with API info"""
    return {
        "message": "PL Master Data API",
        "version": "1.0.0",
        "endpoints": {
            "GET /records/company/{company_code}": "Fetch all records for a company",
            "POST /records/batch-sync": "Upsert records and delete specified rows",
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
def fetch_data(company_code: str):
    """Fetch all records for a given CompanyCode"""
    try:
        conn = get_connection()
        query = f"""
            SELECT * FROM [MLDataWarehouse].[dbo].[PL_Master]
            WHERE CompanyCode = '{company_code}'
            ORDER BY UniqueID
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
        logging.info(f"Fetched {len(records)} records for {company_code}")
        
        return {
            "status": "success",
            "company_code": company_code,
            "record_count": len(records),
            "records": records
        }
    except Exception as e:
        logging.error(f"Failed to fetch data for {company_code}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch data: {str(e)}")

@app.post("/records/batch-sync")
def upsert_data(request: UpsertRequest):
    """Upsert records and delete specified rows"""
    company_code = request.company_code
    records = request.records
    deleted_ids = request.deleted_ids or []
    
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Get existing UniqueIDs
        cursor.execute(
            f"SELECT UniqueID FROM [MLDataWarehouse].[dbo].[PL_Master] WHERE CompanyCode = '{company_code}'"
        )
        existing_ids = {row[0] for row in cursor.fetchall()}
        
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
                    # UPDATE
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
                    updated += 1
                else:
                    # INSERT
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
                deleted += 1
            except Exception as e:
                errors.append(f"Delete {unique_id}: {str(e)}")
                logging.error(f"Delete error for {unique_id}: {e}")
        
        conn.commit()
        conn.close()
        
        logging.info(f"Upsert for {company_code}: Inserted={inserted}, Updated={updated}, Deleted={deleted}")
        
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
def delete_record(unique_id: str, company_code: str = Query(...)):
    """Delete a specific record by UniqueID"""
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
            logging.info(f"Deleted record {unique_id} from {company_code}")
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
    line_item: Optional[str] = None
):
    """Search records by multiple criteria"""
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8015)

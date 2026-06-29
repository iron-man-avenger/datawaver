import streamlit as st
import pandas as pd
import pyodbc
import os
from datetime import datetime
import logging
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Configure logging
logging.basicConfig(
    filename="edit_data_audit.log",
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)

# Page configuration
st.set_page_config(
    page_title="PL Master Data Editor",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# CSS for better UI
st.markdown("""
    <style>
    .success-box { background-color: #d4edda; padding: 10px; border-radius: 5px; }
    .error-box { background-color: #f8d7da; padding: 10px; border-radius: 5px; }
    .info-box { background-color: #d1ecf1; padding: 10px; border-radius: 5px; }
    </style>
""", unsafe_allow_html=True)

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

@st.cache_resource
def get_connection():
    """Create and return a SQL Server connection"""
    try:
        conn_str = (
            "DRIVER={ODBC Driver 18 for SQL Server};"
            f"SERVER={DB_SERVER};"
            f"DATABASE={DB_NAME};"
            f"UID={DB_USER};"
            f"PWD={DB_PASSWORD};"
            "TrustServerCertificate=yes;"
        )
        conn = pyodbc.connect(conn_str)
        conn.autocommit = False
        return conn
    except Exception as e:
        st.error(f"❌ Database connection failed: {e}")
        logging.error(f"Database connection failed: {e}")
        raise e

def fetch_data(company_code):
    """Fetch data from PL_Master for a given CompanyCode"""
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
            st.warning(f"⚠️ No data found for Company Code: {company_code}")
            return None
        
        return df
    except Exception as e:
        st.error(f"❌ Failed to fetch data: {e}")
        logging.error(f"Failed to fetch data for {company_code}: {e}")
        return None

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
    """Convert value to integer or None (for bit columns: 0 or 1)"""
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

def validate_row(row, allow_null_required=False):
    """
    Validate a row for required fields and data types.
    Returns (is_valid, error_message)
    """
    for col in REQUIRED_COLUMNS:
        val = row.get(col)
        if val is None or (isinstance(val, float) and pd.isna(val)) or (isinstance(val, str) and val.strip() == ""):
            if not allow_null_required:
                return False, f"Missing required field: {col}"
    return True, ""

def upsert_data(df, company_code, conn):
    """Upsert data into PL_Master table"""
    cursor = conn.cursor()
    inserted = 0
    updated = 0
    errors = []
    
    # Get existing UniqueIDs for this CompanyCode
    try:
        cursor.execute(
            f"SELECT UniqueID FROM [MLDataWarehouse].[dbo].[PL_Master] WHERE CompanyCode = '{company_code}'"
        )
        existing_ids = {row[0] for row in cursor.fetchall()}
    except Exception as e:
        errors.append(f"Failed to fetch existing IDs: {e}")
        existing_ids = set()
    
    for index, row in df.iterrows():
        try:
            unique_id = safe_val(row.get('UniqueID'))
            gl_code = safe_val(row.get('GLCode'))
            line_item = safe_val(row.get('LineItem'))
            company_code_val = safe_val(row.get('CompanyCode'))
            site_code = safe_val(row.get('SiteCode'))
            grandparent = safe_val(row.get('GrandParent'))
            parent = safe_val(row.get('Parent'))
            grandparent_code = safe_val(row.get('GrandParentCode'))
            parent_code = safe_val(row.get('ParentCode'))
            line_item_code = safe_val(row.get('LineItemCode'))
            is_aggregated = safe_int(row.get('IsAggregated'))
            agg_formula = safe_val(row.get('AggregatedFormula'))
            pct_formula = safe_val(row.get('PercentageFormula'))
            erp_software = safe_val(row.get('ERPSoftware'))
            sub_nl_code = safe_val(row.get('SubNLCode'))
            is_cogs = safe_int(row.get('IsCOGS'))
            is_sales = safe_int(row.get('IsSales'))
            is_discount = safe_int(row.get('IsDiscount'))
            
            # Validate required fields
            required_fields = {
                'UniqueID': unique_id,
                'GLCode': gl_code,
                'LineItem': line_item,
                'CompanyCode': company_code_val,
                'SiteCode': site_code,
                'IsCOGS': is_cogs,
                'IsSales': is_sales,
                'IsDiscount': is_discount
            }
            
            missing = [k for k, v in required_fields.items() if v is None]
            if missing:
                errors.append(f"Row {index + 1} ({unique_id or 'NEW'}): Missing required fields: {', '.join(missing)}")
                continue
            
            # Prepare SQL values
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
            errors.append(f"Row {index + 1} ({row.get('UniqueID')}): {str(e)}")
            logging.error(f"Upsert error at row {index + 1}: {e}")
    
    conn.commit()
    return inserted, updated, errors

def delete_rows(deleted_ids, company_code, conn):
    """Delete rows from PL_Master"""
    cursor = conn.cursor()
    deleted = 0
    errors = []
    
    for unique_id in deleted_ids:
        try:
            delete_query = f"""
                DELETE FROM [MLDataWarehouse].[dbo].[PL_Master]
                WHERE UniqueID = '{unique_id}' AND CompanyCode = '{company_code}'
            """
            cursor.execute(delete_query)
            deleted += 1
        except Exception as e:
            errors.append(f"Failed to delete {unique_id}: {str(e)}")
            logging.error(f"Delete error for {unique_id}: {e}")
    
    conn.commit()
    return deleted, errors

# ===== STREAMLIT UI =====
st.title("📊 PL Master Data Editor")
st.markdown("Edit, add, and delete PL Master records with full CRUD capabilities.")

# Sidebar
with st.sidebar:
    st.header("⚙️ Configuration")
    st.info(f"📍 **Database:** {DB_NAME}\n🖥️ **Server:** {DB_SERVER}")
    
    company_code = st.text_input(
        "🏢 Enter Company Code",
        placeholder="e.g., C077",
        help="Enter the company code to fetch and edit data"
    )
    
    if st.button("🔄 Load Data", use_container_width=True):
        st.session_state.company_code = company_code
        st.session_state.data_loaded = False

# Main content
if 'company_code' in st.session_state and st.session_state.company_code:
    company_code = st.session_state.company_code
    
    if not st.session_state.get('data_loaded'):
        with st.spinner("📂 Fetching data..."):
            df = fetch_data(company_code)
            if df is not None:
                st.session_state.df = df.copy()
                st.session_state.original_df = df.copy()
                st.session_state.data_loaded = True
                st.session_state.row_ids = set(df['UniqueID'].astype(str).tolist())
                st.success(f"✅ Loaded {len(df)} records for {company_code}")
                st.rerun()
            else:
                st.session_state.data_loaded = True
    
    if st.session_state.get('data_loaded') and 'df' in st.session_state:
        df = st.session_state.df
        
        # Display summary
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("📋 Total Records", len(df))
        with col2:
            st.metric("🏢 Company Code", company_code)
        with col3:
            st.metric("📅 Last Updated", datetime.now().strftime("%Y-%m-%d %H:%M"))
        
        st.divider()
        
        # Insert Row Section
        st.subheader("➕ Insert New Row")
        col_insert1, col_insert2 = st.columns([2, 1])
        
        with col_insert1:
            row_pos = st.number_input(
                "Insert after row number (0 = at top)",
                min_value=0,
                max_value=len(df),
                value=len(df),
                help="0 = insert at top, N = insert after row N"
            )
        
        with col_insert2:
            if st.button("➕ Insert Row", use_container_width=True):
                # Create a new empty row with all required fields as empty
                new_row = {col: None for col in ALL_COLUMNS}
                # Insert at specified position
                df_top = df.iloc[:row_pos]
                df_bottom = df.iloc[row_pos:]
                df = pd.concat([df_top, pd.DataFrame([new_row]), df_bottom], ignore_index=True)
                st.session_state.df = df
                st.success(f"✅ New row inserted at position {row_pos + 1}")
                st.rerun()
        
        st.divider()
        
        # Editable Data Editor
        st.subheader("✏️ Edit Data")
        
        edited_df = st.data_editor(
            df,
            use_container_width=True,
            num_rows="dynamic",
            key="data_editor",
            height=400,
            hide_index=False
        )
        
        st.session_state.edited_df = edited_df
        
        st.divider()
        
        # Action buttons
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            if st.button("💾 Save Changes", use_container_width=True, type="primary"):
                if edited_df is None or len(edited_df) == 0:
                    st.error("❌ No data to save")
                else:
                    # Identify added and deleted rows
                    current_ids = set(edited_df['UniqueID'].astype(str).tolist()) if 'UniqueID' in edited_df.columns else set()
                    original_ids = st.session_state.row_ids
                    
                    added_rows = edited_df[edited_df['UniqueID'].astype(str).isin(current_ids - original_ids)]
                    deleted_ids = original_ids - current_ids
                    
                    with st.spinner("💾 Saving data..."):
                        try:
                            conn = get_connection()
                            
                            # Upsert all rows (insert/update)
                            inserted, updated, upsert_errors = upsert_data(edited_df, company_code, conn)
                            
                            # Delete removed rows
                            deleted, delete_errors = delete_rows(deleted_ids, company_code, conn)
                            
                            conn.close()
                            
                            # Show results
                            st.success(f"""
                                ✅ **Save Complete!**
                                - 📝 Inserted: {inserted}
                                - ✏️ Updated: {updated}
                                - 🗑️ Deleted: {deleted}
                            """)
                            
                            # Show errors if any
                            if upsert_errors or delete_errors:
                                with st.expander("⚠️ View Errors", expanded=False):
                                    for err in upsert_errors + delete_errors:
                                        st.warning(err)
                            
                            # Log audit
                            logging.info(f"User saved data for {company_code}: Inserted={inserted}, Updated={updated}, Deleted={deleted}")
                            
                            # Reload data
                            st.session_state.data_loaded = False
                            st.rerun()
                        
                        except Exception as e:
                            st.error(f"❌ Save failed: {e}")
                            logging.error(f"Save failed for {company_code}: {e}")
        
        with col2:
            if st.button("🔄 Reload", use_container_width=True):
                st.session_state.data_loaded = False
                st.rerun()
        
        with col3:
            if st.button("🗑️ Clear Filters", use_container_width=True):
                st.session_state.df = st.session_state.original_df.copy()
                st.rerun()
        
        with col4:
            if st.button("📥 Download CSV", use_container_width=True):
                csv = edited_df.to_csv(index=False)
                st.download_button(
                    label="Download",
                    data=csv,
                    file_name=f"PL_Master_{company_code}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
                    mime="text/csv"
                )
        
        st.divider()
        
        # Table info
        with st.expander("📋 Column Information", expanded=False):
            col_info = pd.DataFrame({
                'Column Name': ALL_COLUMNS,
                'Data Type': [COLUMN_DTYPES.get(col, 'string') for col in ALL_COLUMNS],
                'Required': ['✅ NO' if col in NULLABLE_COLUMNS else '🔴 YES' for col in ALL_COLUMNS]
            })
            st.dataframe(col_info, use_container_width=True, hide_index=True)
        
        # Help section
        with st.expander("❓ How to Use", expanded=False):
            st.markdown("""
                ### 📍 Insert Rows at Any Position:
                - **Insert Row Section**: Above the table, enter the row number **after** which you want to insert
                - **Row 0** = Insert at the very top
                - **Row 5** = Insert after the 5th row (between rows 5-6)
                - **Row N** (last) = Insert at the bottom
                - Click **➕ Insert Row** button
                - New empty row will be created at that position
                - Then edit the row with your data
                
                ### Editing:
                - **Edit Values**: Click any cell to edit directly
                - **Add Rows at Bottom**: Click the "+" button at the bottom of the table
                - **Delete Rows**: Click the "−" button to remove rows
                
                ### Saving:
                - **Save Changes**: All edits (new, modified, deleted) are saved to the database
                - **Reload**: Discard changes and reload original data
                - **Download**: Export current data as CSV
                
                ### ⚠️ Required Fields (Cannot be empty):
                - **UniqueID**, **GLCode**, **LineItem**, **CompanyCode**, **SiteCode**
                - **IsCOGS**, **IsSales**, **IsDiscount** (must be 0 or 1)
                
                ### Optional Fields:
                - GrandParent, Parent, GrandParentCode, ParentCode, LineItemCode
                - IsAggregated, AggregatedFormula, PercentageFormula
                - ERPSoftware, SubNLCode
                - Leave these **empty** to store as NULL in database
                
                ### Data Rules:
                - **Bit Columns**: IsCOGS, IsSales, IsDiscount, IsAggregated = 0, 1, or empty (NULL)
                - **Text Columns**: Follow varchar/nvarchar length limits
                - **Formula Columns**: Can contain up to MAX length text
                
                ### Audit:
                - All changes are logged to `edit_data_audit.log`
            """)

else:
    st.info("👈 Enter a **Company Code** in the sidebar and click **Load Data** to get started.")

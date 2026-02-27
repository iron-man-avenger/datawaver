# Architecture & Data Flow Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                         │
│                      localhost:5173                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     UI Components                        │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │   CompanySearch  │  EditableTable │  ColumnPanel   │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │   │
│  └────────────────┬────────────────────────────────────────┘   │
│                   │                                              │
│  ┌────────────────▼───────────────────────────────────────┐    │
│  │            React State Management                       │    │
│  │  - rows (PLMasterRow[])                                │    │
│  │  - deletedIds (string[])                               │    │
│  │  - isLoading, loadError                                │    │
│  └────────────────┬────────────────────────────────────────┘    │
│                   │                                              │
│  ┌────────────────▼───────────────────────────────────────┐    │
│  │         API Client Service (apiClient.ts)              │    │
│  │  ┌──────────────────────────────────────────────────┐  │    │
│  │  │ • fetchCompanyData()     → GET /records/company/{code}  │  │    │
│  │  │ • saveData()             → POST /records/batch-sync    │  │    │
│  │  │ • deleteRecord()         → DELETE /records/{id}        │  │    │
│  │  │ • checkHealth()          → GET /health              │  │    │
│  │  │ • getColumnMetadata()    → GET /schema/columns       │  │    │
│  │  └──────────────────────────────────────────────────┘  │    │
│  └────────────────┬────────────────────────────────────────┘    │
│                   │                                              │
│        HTTP/JSON  │ CORS Enabled (All Origins)                  │
│                   │                                              │
└─────────────────┼──────────────────────────────────────────────┘
                  │
                  │ ◄── .env.local ──► VITE_API_BASE_URL
                  │                   http://localhost:8015
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                       BACKEND (FastAPI)                          │
│                      localhost:8015                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              API Endpoints (api.py)                      │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │ GET    /health                                       │   │   │
│  │  │ GET    /schema/columns                                 │   │   │
│  │  │ GET    /records/company/{company_code}                │   │   │
│  │  │ POST   /records/batch-sync  (upsert + delete)         │   │   │
│  │  │ DELETE /records/{unique_id}                           │   │   │
│  │  │ GET    /records/search                                 │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └────────────────┬────────────────────────────────────────┘   │
│                   │                                              │
│  ┌────────────────▼───────────────────────────────────────┐    │
│  │      Pydantic Models & Validation                       │    │
│  │  - PLMasterRecord                                      │    │
│  │  - UpsertRequest (company_code, records, deleted_ids)  │    │
│  └────────────────┬────────────────────────────────────────┘    │
│                   │                                              │
│  ┌────────────────▼───────────────────────────────────────┐    │
│  │         Database Operations (pyodbc)                    │    │
│  │  - SELECT: Fetch records by company code              │    │
│  │  - INSERT: New rows with UniqueID check               │    │
│  │  - UPDATE: Existing rows by UniqueID                  │    │
│  │  - DELETE: Mark rows as deleted                       │    │
│  └────────────────┬────────────────────────────────────────┘    │
│                   │                                              │
│     SQL Server Connection String ◄── .env                       │
│     - DB_SERVER                                                 │
│     - DB_DATABASE=MLDataWarehouse                              │
│     - DB_USERNAME                                              │
│     - DB_PASSWORD                                              │
│                   │                                              │
└─────────────────┼──────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SQL SERVER DATABASE                           │
│            MLDataWarehouse.dbo.PL_Master                        │
├─────────────────────────────────────────────────────────────────┤
│  UniqueID | GLCode | LineItem | CompanyCode | SiteCode | ... │
│  77\300   │ 300    │ Revenue  │ C077        │ L077     │ ... │
│  77\301   │ 301    │ COGS     │ C077        │ L077     │ ... │
│  ...      │ ...    │ ...      │ ...         │ ...      │ ... │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Load Data

```
User enters "C077" and clicks "Load Data"
            │
            ▼
CompanySearch.onSearch("C077") triggered
            │
            ▼
Index.handleSearch() → setIsLoading(true)
            │
            ▼
fetchCompanyData("C077") [from plMasterTypes.ts]
            │
            ▼
apiFetchCompanyData("C077") [from apiClient.ts]
            │
            ▼
fetch("http://localhost:8015/records/company/C077")
            │
            ▼ HTTP GET Request
            │
┌───────────────────────────┐
│   Backend receives request │
└──────────────┬────────────┘
               │
               ▼
    SELECT * FROM [MLDataWarehouse].[dbo].[PL_Master]
    WHERE CompanyCode = 'C077'
               │
               ▼
    Database returns 5 records
               │
               ▼
    Backend Response: {status: "success", records: [...]}
               │
            HTTP Response
               │
            ▼ Frontend receives response
            │
apiClient.ts parses JSON
            │
            ▼
Returns PLMasterRecord[] array
            │
            ▼
plMasterTypes.ts returns Promise<PLMasterRow[]>
            │
            ▼
Index.ts receives data
            │
            ▼
setData(rows) → setIsLoading(false)
            │
            ▼
Component re-renders with data
            │
            ▼
Table displays 5 editable rows ✨
```

---

## Data Flow: Save Changes

```
User edits rows and clicks "Save Changes"
            │
            ▼
PLEditor.handleSave() triggered
            │
            ▼
validateRows() → Check required fields
            │
    Validation passes ✓
            │
            ▼
setIsSaving(true)
            │
            ▼
saveData(rows, deletedIds, "C077")
            │
            ▼
apiSaveData(...)
            │
            ▼
Filter UI tracking fields (_rowId, _isNew, etc.)
            │
            ▼
fetch("http://localhost:8015/records/batch-sync", {
  method: "POST",
  body: {
    company_code: "C077",
    records: [modified PLMasterRecord[]],
    deleted_ids: ["77\300", ...]
  }
})
            │
            ▼ HTTP POST Request
            │
┌──────────────────────────────────┐
│  Backend receives request         │
└──────────┬───────────────────────┘
           │
           ▼
For each row in records:
  • Check if UniqueID exists
  • If exists → UPDATE query
  • If not → INSERT query
           │
           ▼
For each ID in deleted_ids:
  • DELETE query
           │
           ▼
Execute all queries in transaction
           │
           ▼
Database updated successfully
           │
           ▼
Backend Response:
{
  status: "success",
  inserted: 2,
  updated: 1,
  deleted: 1
}
           │
            HTTP Response
           │
            ▼ Frontend receives response
            │
apiClient.ts parses response
            │
            ▼
Returns { inserted: 2, updated: 1, deleted: 1, errors: [] }
            │
            ▼
addToast("success", "Saved successfully", message)
            │
            ▼
setIsSaving(false)
            │
            ▼
User sees green "Saved successfully" toast ✨
```

---

## Integration Points

### 1. Load Company Data
```typescript
// File: src/pages/Index.tsx
const handleSearch = useCallback(async (code: string) => {
  setIsLoading(true);
  try {
    const rows = await fetchCompanyData(code);  // ← API call
    setData(rows);
  } catch (err) {
    setLoadError(err.message);
  }
}, []);
```

### 2. Save Data
```typescript
// File: src/pages/Index.tsx - PLEditor component
const handleSave = async () => {
  const result = await saveData(rows, deletedIds, companyCode);  // ← API call
  addToast('success', 'Saved successfully');
};
```

### 3. API Client
```typescript
// File: src/lib/apiClient.ts
export async function fetchCompanyData(companyCode: string) {
  const response = await fetch(`${API_BASE_URL}/records/company/${companyCode}`);
  return response.json();
}

export async function saveData(rows, deletedIds, companyCode) {
  const response = await fetch(`${API_BASE_URL}/records/batch-sync`, {
    method: 'POST',
    body: JSON.stringify({ company_code: companyCode, records: rows, deleted_ids: deletedIds })
  });
  return response.json();
}
```

---

## Error Handling Flow

```
API Call Made
    │
    ▼
Response received?
    │
    ├─ NO  → Network Error
    │         │
    │         ▼
    │   "Failed to load data: Network error"
    │
    └─ YES → Parse JSON
             │
             ▼
         Status = "success"?
             │
             ├─ YES → Data saved successfully
             │         │
             │         ▼
             │     Green toast notification
             │
             └─ NO → API returned error
                      │
                      ▼
                  "Failed to load data: {error message}"
                      │
                      ▼
                  Red error box with Retry button
```

---

## Configuration Files

### Frontend (.env.local)
```env
VITE_API_BASE_URL=http://localhost:8015
```

### Backend (.env)
```env
DB_SERVER=your-server
DB_DATABASE=MLDataWarehouse
DB_USERNAME=username
DB_PASSWORD=password
```

---

## Type Safety & Validation

✅ **TypeScript** ensures type safety throughout the pipeline
✅ **Pydantic** on backend validates request/response schemas
✅ **Frontend validation** checks required fields before sending
✅ **Backend validation** checks data types and constraints
✅ **Error messages** are propagated back to user

---

## Performance Considerations

- **Batch operations**: All changes saved in one POST request
- **Efficient queries**: WHERE clauses filter only relevant data
- **Transaction support**: Database operations are atomic
- **Error recovery**: Partial failures don't lose all changes

---

## Security Features

✅ SQL injection prevention (parameterized queries)
✅ CORS enabled for frontend access
✅ Type validation on both ends
✅ Audit logging on backend
✅ Error messages sanitized (no SQL details to users)

---

This architecture ensures a clean separation of concerns, proper error handling, and seamless communication between frontend and backend!

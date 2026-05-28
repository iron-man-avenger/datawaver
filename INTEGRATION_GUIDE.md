# PL Master Editor - API Integration Setup

## Overview
✅ Integrated FastAPI backend with React frontend
✅ Removed all mock data
✅ API client service created
✅ Error handling implemented
✅ Environment configuration added

---

## Backend Setup

### 1. Start the FastAPI Backend

Navigate to the backend directory:
```bash
cd backend
```

Create and activate virtual environment (if not already done):
```bash
python -m venv .venv
.venv\Scripts\activate  # Windows
# or
source .venv/bin/activate  # Mac/Linux
```

Install dependencies:
```bash
pip install -r requirements.txt
```

Start the API server:
```bash
python -m uvicorn api:app --reload --host 0.0.0.0 --port 8015
```

The API should now be running at: **http://10.200.7.77:8015**

### 2. Verify API Health

Test the API health endpoint:
```bash
curl http://10.200.7.77:8015/health
```

Expected response:
```json
{
  "status": "healthy",
  "database": "MLDataWarehouse",
  "server": "your-server-name",
  "pl_master_rows": {count}
}
```

---

## Frontend Setup

### 1. Environment Configuration

The `.env.local` file is already created with:
```
VITE_API_BASE_URL=http://10.200.7.77:8015
```

If you need to change the API URL later, simply edit this file.

### 2. Start the Frontend

Navigate to the frontend directory:
```bash
cd frontend
```

Install dependencies (if not done):
```bash
npm install
# or
bun install
```

Start the dev server:
```bash
npm run dev
# or
bun run dev
```

The frontend should now be running at: **http://10.200.7.77:5173** (or the port shown in terminal)

---

## Testing the Integration

### 1. Verify API Connection
- Open the frontend in your browser
- You should see the **PL Master Editor** welcome screen
- If not, check that:
  - Backend is running on port 8015
  - Database credentials are correct in the `.env` file (backend)

### 2. Load Company Data
- Enter a valid **Company Code** (e.g., **C077**)
- Click **Load Data**
- You should see the data retrieved from the backend database
- If you get an error, check:
  - API is running and accessible
  - Company code exists in the database
  - Database connection is working

### 3. Edit and Save Data
- **Add Row**: Click "+ Add Row" button
- **Edit**: Click on any cell to edit inline
- **Duplicate**: Hover over a row and click the copy icon
- **Delete**: Click the trash icon to mark for deletion
- **Save**: Click "Save Changes" to persist to database
- Check for success/error messages

### 4. Other Features
- **Download CSV**: Export current view as CSV file
- **Reload**: Refresh data from database (discards local changes)
- **Validation**: Required fields are marked with * and validated before save

---

## API Endpoints Used

Here's what the frontend calls:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/records/company/{company_code}` | GET | Load all records for a company |
| `/records/batch-sync` | POST | Upsert (insert/update) and delete records |
| `/records/{unique_id}` | DELETE | Delete single record |
| `/health` | GET | Check API/database connection |
| `/schema/columns` | GET | Get column metadata (optional) |

---

## Features Implemented

✅ **Load Company Data** - Fetch from backend API
✅ **Edit Inline** - Edit cells directly in the table
✅ **Add/Duplicate Rows** - Create new records
✅ **Delete Rows** - Mark rows for deletion
✅ **Save Changes** - Upsert to database
✅ **Error Handling** - User-friendly error messages with retry
✅ **Loading States** - Visual spinners during API calls
✅ **Validation** - Required field validation before save
✅ **CSV Export** - Download edited data as CSV
✅ **Status Badges** - Show new/modified/deleted row counts

---

## Troubleshooting

### "Failed to load data" Error
**Check:**
1. Backend is running: `python -m uvicorn api:app --reload --host 0.0.0.0 --port 8015`
2. API URL is correct in `.env.local`: `VITE_API_BASE_URL=http://10.200.7.77:8015`
3. Company code exists in database
4. Database connection in backend `.env` file is correct

### "No data found for company code" Error
- Verify the company code exists in the `PL_Master` table
- Check the database is accessible

### CORS Errors
- These are handled in the backend with `CORSMiddleware`
- Should allow requests from any origin

### API Timeouts
- Check backend is running
- Verify network connectivity
- Check database performance (large datasets)

---

## Next Steps

1. Test with your actual company codes and data
2. Verify all CRUD operations work correctly
3. Test edge cases (empty tables, special characters, large datasets)
4. Monitor API logs for any issues
5. Consider implementing additional features:
   - Column filtering
   - Search functionality
   - Batch operations
   - Audit logging

---

## File Changes Summary

### New Files Created:
- `.env.local` - API configuration
- `src/lib/apiClient.ts` - API client service

### Files Modified:
- `src/lib/plMasterTypes.ts` - Removed mock data, integrated real API calls
- `src/pages/Index.tsx` - Enhanced error handling and UI feedback

### Removed:
- Mock data arrays
- Demo network delays
- Placeholder API comments

---

## API Response Handling

The frontend now properly handles:
- ✅ Successful data fetches
- ✅ Validation errors
- ✅ Network/connection errors
- ✅ Database-specific errors
- ✅ Partial failures (save with some errors)

All errors are displayed in user-friendly toast notifications!

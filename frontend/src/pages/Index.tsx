import { useState, useCallback, useRef, useEffect } from 'react';
import {
  fetchCompanyData,
  saveData,
  deleteAllRecords,
  PLMasterRow,
} from '@/lib/plMasterTypes';
import { useTableEditor } from '@/hooks/useTableEditor';
import { EditableTable } from '@/components/EditableTable';
import { CompanySearch } from '@/components/CompanySearch';
import { SearchBar } from '@/components/SearchFilterPanel';
import { ToastNotification } from '@/components/ToastNotification';
import { ColumnInfoPanel } from '@/components/ColumnInfoPanel';
import { HistoryDialog } from '@/components/HistoryDialog';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Save, RotateCcw, Download, Database, ChevronRight,
  Layers, TrendingUp, FileSpreadsheet, AlertTriangle, History, LogOut, Settings, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';


interface Toast {
  id: number;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  if (value === 0) return null;
  return (
    <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', color)}>
      <span>{value}</span>
      <span className="font-normal opacity-80">{label}</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Inner editor — only rendered after data is loaded
// ──────────────────────────────────────────────────────────────────────
function PLEditor({
  initialRows,
  companyCode,
  onReload,
}: {
  initialRows: PLMasterRow[];
  companyCode: string;
  onReload: () => void;
}) {
  const { token, canViewHistory } = useAuth();
  const { rows, deletedIds, addRow, updateCell, deleteRow, duplicateRow, reorderRows, validateRows, resetToOriginal, getStats } =
    useTableEditor({ initialRows, companyCode });
  
  const [filteredRows, setFilteredRows] = useState<PLMasterRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showValidation, setShowValidation] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const toastId = useRef(1);

  // Determine which rows to display: filtered or all rows
  const displayRows = filteredRows.length > 0 ? filteredRows : rows;
  const isFilterActive = filteredRows.length > 0 && filteredRows.length < rows.length;

  const addToast = (type: Toast['type'], title: string, message?: string) => {
    const id = toastId.current++;
    setToasts(prev => [...prev, { id, type, title, message }]);
  };

  const removeToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  const handleSave = async () => {
    const errors = validateRows();
    if (errors.length > 0) {
      setValidationErrors(errors);
      setShowValidation(true);
      addToast('error', 'Validation Failed', `${errors.length} issue(s) found`);
      return;
    }
    setValidationErrors([]);
    setShowValidation(false);
    setIsSaving(true);
    try {
      if (!token) {
        throw new Error('Authentication token missing. Please log in again.');
      }
      const result = await saveData(rows, deletedIds, companyCode, token);
      if (result.errors.length > 0) {
        addToast('error', 'Saved with errors', result.errors.slice(0, 3).join('\n'));
      } else {
        addToast(
          'success',
          'Saved successfully',
          `Inserted: ${result.inserted} · Updated: ${result.updated} · Deleted: ${result.deleted}`
        );
      }
    } catch (err: any) {
      addToast('error', 'Save failed', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadCSV = () => {
    const headers = ['UniqueID','GLCode','LineItem','CompanyCode','SiteCode','GrandParent','Parent',
      'GrandParentCode','ParentCode','LineItemCode','IsAggregated','AggregatedFormula',
      'PercentageFormula','ERPSoftware','SubNLCode','IsCOGS','IsSales','IsDiscount'];
    const csvRows = [
      headers.join(','),
      ...rows.map(r =>
        headers.map(h => {
          const v = r[h as keyof PLMasterRow];
          if (v === null || v === undefined) return '';
          const s = String(v);
          return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(',')
      )
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PL_Master_${companyCode}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteAll = async () => {
    setShowDeleteAllDialog(false);
    setIsDeleting(true);
    try {
      if (!token) {
        throw new Error('Authentication token missing. Please log in again.');
      }
      // Get all record IDs from current rows
      const allRecordIds = rows.map(r => r.UniqueID);
      const result = await deleteAllRecords(allRecordIds, companyCode, token);
      if (result.errors.length > 0) {
        addToast('error', 'Deleted with errors', result.errors.slice(0, 3).join('\n'));
      } else {
        addToast('success', 'Deleted successfully', `Deleted all ${result.deleted} records`);
        onReload();
      }
    } catch (err: any) {
      addToast('error', 'Delete failed', err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const stats = getStats();

  return (
    <div className="flex flex-col h-full gap-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/60 gap-3 flex-wrap">
        {/* Left: stats */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground font-mono">
            <span className="text-foreground font-semibold">{stats.total}</span> rows
          </span>
          <ChevronRight size={14} className="text-border" />
          <StatBadge label="new" value={stats.newRows} color="bg-success/15 text-success" />
          <StatBadge label="modified" value={stats.modifiedRows} color="bg-primary/15 text-primary" />
          <StatBadge label="pending delete" value={stats.deletedRows} color="bg-destructive/15 text-destructive" />
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 relative">
          <ColumnInfoPanel />

          {/* Search Bar */}
          <SearchBar
            records={rows}
            onFilteredResults={setFilteredRows}
          />

          {canViewHistory && (
            <button
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/70 transition-colors border border-border"
            >
              <History size={13} />
              History
            </button>
          )}

          <button
            onClick={() => addRow(rows.length - 1)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/70 transition-colors border border-border"
          >
            <Plus size={13} />
            Add Row
          </button>

          <button
            onClick={handleDownloadCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/70 transition-colors border border-border"
          >
            <Download size={13} />
            CSV
          </button>

          <button
            onClick={() => { resetToOriginal(); onReload(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/70 transition-colors border border-border"
          >
            <RotateCcw size={13} />
            Reload
          </button>

          <button
            onClick={() => setShowDeleteAllDialog(true)}
            disabled={isDeleting || stats.total === 0}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold',
              'bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors border border-destructive/30',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <Trash2 size={13} />
            Delete All
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-bold',
              'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
              'disabled:opacity-60 disabled:cursor-not-allowed glow-primary shadow-sm'
            )}
          >
            {isSaving ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save size={13} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Validation errors */}
      {showValidation && validationErrors.length > 0 && (
        <div className="px-4 py-2.5 border-b border-destructive/40 bg-destructive/10 flex items-start gap-2">
          <AlertTriangle size={15} className="text-destructive mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-destructive mb-1">Validation errors — fix before saving</p>
            <ul className="text-xs text-destructive/80 space-y-0.5">
              {validationErrors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
              {validationErrors.length > 5 && <li>…and {validationErrors.length - 5} more</li>}
            </ul>
          </div>
          <button onClick={() => setShowValidation(false)} className="text-destructive/60 hover:text-destructive text-xs shrink-0">✕</button>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-b border-border text-[11px] text-muted-foreground select-none flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-success/30 border border-success/40" />
          New row
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-primary/30 border border-primary/40" />
          Modified
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-destructive">*</span> Required field
        </div>
        <span>Tab/Enter to navigate</span>
        <span>Drag to reorder rows</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden">
        <EditableTable
          rows={displayRows}
          onUpdateCell={updateCell}
          onDeleteRow={deleteRow}
          onDuplicateRow={duplicateRow}
          onAddRowAfter={addRow}
          onReorderRows={isFilterActive ? undefined : reorderRows}
        />
      </div>

      {/* Toasts */}
      {toasts.map(t => (
        <ToastNotification
          key={t.id}
          type={t.type}
          title={t.title}
          message={t.message}
          onClose={() => removeToast(t.id)}
        />
      ))}

      {/* History Dialog */}
      <HistoryDialog
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        companyCode={companyCode}
        showAllHistory={canViewHistory}
      />

      {/* Delete All Dialog */}
      <AlertDialog 
        open={showDeleteAllDialog} 
        onOpenChange={(open) => {
          setShowDeleteAllDialog(open);
          if (!open) setDeleteConfirmChecked(false);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete All Records?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3">
                <p className="text-sm font-semibold text-destructive mb-2">⚠️ Warning</p>
                <p className="text-sm text-destructive">This will <strong>permanently delete all {stats.total} records</strong> for company code <span className="font-mono font-bold">{companyCode}</span>.</p>
                <p className="text-sm text-destructive mt-2"><strong>This action CANNOT be undone.</strong></p>
              </div>
              
              <div className="flex items-center gap-2 mt-4 p-3 bg-muted rounded-md">
                <Checkbox 
                  id="delete-confirm"
                  checked={deleteConfirmChecked}
                  onCheckedChange={(checked) => setDeleteConfirmChecked(checked === true)}
                />
                <label 
                  htmlFor="delete-confirm"
                  className="text-sm font-semibold cursor-pointer flex-1"
                >
                  I understand that all records will be permanently deleted
                </label>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAll}
              disabled={isDeleting || !deleteConfirmChecked}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-destructive-foreground/30 border-t-destructive-foreground rounded-full animate-spin mr-2" />
                  Deleting…
                </>
              ) : (
                'Delete All Records'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────────────
const Index = () => {
  const { username, role, logout, token } = useAuth();
  const navigate = useNavigate();
  const [companyCode, setCompanyCode] = useState('');
  const [data, setData] = useState<PLMasterRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedCode, setLoadedCode] = useState('');

  const handleSearch = useCallback(async (code: string) => {
    setIsLoading(true);
    setLoadError(null);
    setData(null);
    setCompanyCode(code);

    if (!token) {
      setLoadError('Authentication token missing. Please log in again.');
      setIsLoading(false);
      return;
    }

    try {
      const rows = await fetchCompanyData(code, token);
      setData(rows);
      setLoadedCode(code);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const handleReload = useCallback(() => {
    if (loadedCode) handleSearch(loadedCode);
  }, [loadedCode, handleSearch]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Top header bar */}
      <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/20 border border-primary/30">
            <FileSpreadsheet size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground tracking-tight">PL Master Editor</h1>
            <p className="text-[11px] text-muted-foreground">MLDataWarehouse · dbo.PL_Master</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <CompanySearch onSearch={handleSearch} isLoading={isLoading} />

          {loadedCode && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Database size={12} />
              <span className="font-mono font-semibold text-foreground">{loadedCode}</span>
              <span className="px-1.5 py-0.5 rounded bg-success/15 text-success text-[11px] font-medium">connected</span>
            </div>
          )}

          {/* User info and actions */}
          <div className="flex items-center gap-3 pl-4 border-l border-border">
            <div className="text-right">
              <p className="text-xs font-semibold text-foreground">{username}</p>
              <p className="text-[10px] text-muted-foreground">{role}</p>
            </div>

            {role === 'admin' && (
              <button
                onClick={() => navigate('/admin')}
                className="p-2 rounded-md hover:bg-secondary transition-colors"
                title="Admin Panel"
              >
                <Settings size={16} className="text-muted-foreground hover:text-foreground" />
              </button>
            )}

            <button
              onClick={handleLogout}
              className="p-2 rounded-md hover:bg-secondary transition-colors"
              title="Logout"
            >
              <LogOut size={16} className="text-muted-foreground hover:text-foreground" />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {!data && !isLoading && !loadError && (
          <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6">
            {/* Hero state */}
            <div className="text-center max-w-md">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mx-auto mb-5">
                <Layers size={28} className="text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">PL Master Data Editor</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Enter a Company Code above to load P&L master data. 
                Edit, add, and delete rows, then save changes directly to the database.
              </p>
            </div>

            {/* Feature cards */}
            <div className="grid grid-cols-3 gap-3 w-full max-w-lg">
              {[
                { icon: TrendingUp, title: 'Live Edit', desc: 'In-line cell editing with keyboard navigation' },
                { icon: Plus, title: 'CRUD', desc: 'Add, duplicate, delete rows with one click' },
                { icon: Save, title: 'Upsert', desc: 'INSERT new rows, UPDATE existing by UniqueID' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="bg-card border border-border rounded-lg p-4 text-center">
                  <Icon size={18} className="text-primary mx-auto mb-2" />
                  <p className="text-xs font-semibold text-foreground mb-1">{title}</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">{desc}</p>
                </div>
              ))}
            </div>

          </div>
        )}

        {isLoading && (
          <div className="flex-1 flex items-center justify-center gap-3 text-muted-foreground">
            <span className="inline-block w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin" />
            <span className="text-sm">Querying PL_Master for <span className="font-mono font-semibold text-foreground">{companyCode}</span>…</span>
          </div>
        )}

        {loadError && !data && !isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
            <div className="text-center max-w-md">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 mx-auto mb-5">
                <AlertTriangle size={28} className="text-destructive" />
              </div>
              <h2 className="text-2xl font-bold mb-2 text-destructive">Failed to Load Data</h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-4">{loadError}</p>
              <button
                onClick={() => handleSearch(companyCode)}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RotateCcw size={14} />
                Retry
              </button>
            </div>
          </div>
        )}

        {data && !isLoading && (
          <PLEditor
            key={loadedCode}
            initialRows={data}
            companyCode={loadedCode}
            onReload={handleReload}
          />
        )}
      </main>
    </div>
  );
};

export default Index;

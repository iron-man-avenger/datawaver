import { useState, useCallback, useRef, useEffect } from 'react';
import { PLMasterRow, ALL_COLUMNS, BIT_COLUMNS, REQUIRED_COLUMNS } from '@/lib/plMasterTypes';

interface UseTableEditorProps {
  initialRows: PLMasterRow[];
  companyCode: string;
}

export interface CopyDeltaPayload {
  changedRecords: PLMasterRow[];
  deletedIds: string[];
}

function normalizeValueForCompare(column: keyof PLMasterRow, value: any): any {
  if (value === undefined || value === '') {
    return null;
  }

  if (BIT_COLUMNS.has(column as string)) {
    if (value === true) return 1;
    if (value === false) return 0;
    if (value === null) return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return value;
}

export function computeCopyDelta(
  rows: PLMasterRow[],
  deletedIds: string[],
  originalRows: PLMasterRow[]
): CopyDeltaPayload {
  const changedRecords: PLMasterRow[] = [];

  rows.forEach(row => {
    if (row._isNew) {
      changedRecords.push(row);
      return;
    }

    const rowId = row._rowId || '';
    if (!rowId.startsWith('orig-')) {
      return;
    }

    const rowIndex = parseInt(rowId.replace('orig-', ''), 10);
    if (Number.isNaN(rowIndex)) {
      return;
    }

    const original = originalRows[rowIndex];
    if (!original) {
      return;
    }

    const hasAnyFieldChanged = ALL_COLUMNS.some(column => {
      const currentValue = normalizeValueForCompare(column, row[column]);
      const originalValue = normalizeValueForCompare(column, original[column]);
      return currentValue !== originalValue;
    });

    if (hasAnyFieldChanged) {
      changedRecords.push(row);
    }
  });

  return {
    changedRecords,
    deletedIds: [...deletedIds],
  };
}

export function useTableEditor({ initialRows, companyCode }: UseTableEditorProps) {
  const [rows, setRows] = useState<PLMasterRow[]>(() =>
    initialRows.map((r, i) => ({ ...r, _rowId: `orig-${i}` }))
  );
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const nextId = useRef(1);
  const originalRowsRef = useRef<PLMasterRow[]>(initialRows);

  // Update ref when initialRows changes
  useEffect(() => {
    originalRowsRef.current = initialRows;
  }, [initialRows]);

  const addRow = useCallback((afterIndex?: number) => {
    const newRow: PLMasterRow = {
      UniqueID: '', GLCode: '', LineItem: '',
      CompanyCode: companyCode, SiteCode: '',
      GrandParent: null, Parent: null, GrandParentCode: null,
      ParentCode: null, LineItemCode: null, IsAggregated: null,
      AggregatedFormula: null, PercentageFormula: null,
      ERPSoftware: null, SubNLCode: null,
      IsCOGS: 0, IsSales: 0, IsDiscount: 0,
      _rowId: `new-${nextId.current++}`,
      _isNew: true,
      _isModified: false,
    };

    setRows(prev => {
      const idx = afterIndex !== undefined ? afterIndex + 1 : prev.length;
      const next = [...prev];
      next.splice(idx, 0, newRow);
      return next;
    });
  }, [companyCode]);

  const updateCell = useCallback((rowId: string, col: keyof PLMasterRow, value: string) => {
    setRows(prev => prev.map(r => {
      if (r._rowId !== rowId) return r;
      let parsed: string | number | null = value;
      if (BIT_COLUMNS.has(col as string)) {
        parsed = value === '' || value === null ? null : parseInt(value, 10);
      }
      if (value === '' && !REQUIRED_COLUMNS.has(col as string)) parsed = null;

      // If it's a new row, always consider it modified if it has any values
      if (r._isNew) {
        return { ...r, [col]: parsed, _isModified: true };
      }

      // For existing rows, check if value differs from original
      const originalRow = originalRowsRef.current.find((origRow, idx) => `orig-${idx}` === rowId);
      const originalValue = originalRow ? originalRow[col as keyof PLMasterRow] : undefined;
      const isModified = parsed !== originalValue;

      return { ...r, [col]: parsed, _isModified: isModified };
    }));
  }, []);

  const deleteRow = useCallback((rowId: string) => {
    setRows(prev => {
      const row = prev.find(r => r._rowId === rowId);
      if (row && !row._isNew && row.UniqueID) {
        setDeletedIds(d => [...d, row.UniqueID]);
      }
      return prev.filter(r => r._rowId !== rowId);
    });
  }, []);

  const duplicateRow = useCallback((rowId: string) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r._rowId === rowId);
      if (idx === -1) return prev;
      const dup: PLMasterRow = {
        ...prev[idx],
        UniqueID: '',
        _rowId: `new-${nextId.current++}`,
        _isNew: true,
        _isModified: false,
      };
      const next = [...prev];
      next.splice(idx + 1, 0, dup);
      return next;
    });
  }, []);

  const validateRows = useCallback((): string[] => {
    const errors: string[] = [];
    rows.forEach((row, i) => {
      for (const col of REQUIRED_COLUMNS) {
        const val = row[col as keyof PLMasterRow];
        if (val === null || val === undefined || val === '') {
          errors.push(`Row ${i + 1} (${row.UniqueID || 'NEW'}): "${col}" is required`);
        }
      }
    });
    return errors;
  }, [rows]);

  const resetToOriginal = useCallback(() => {
    setRows(initialRows.map((r, i) => ({ ...r, _rowId: `orig-${i}` })));
    setDeletedIds([]);
  }, [initialRows]);

  const reorderRows = useCallback((fromIndex: number, toIndex: number) => {
    setRows(prev => {
      if (fromIndex === toIndex) return prev;
      const next = [...prev];
      const [movedRow] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, movedRow);
      return next;
    });
  }, []);

  const getStats = useCallback(() => ({
    total: rows.length,
    newRows: rows.filter(r => r._isNew).length,
    modifiedRows: rows.filter(r => r._isModified && !r._isNew).length,
    deletedRows: deletedIds.length,
  }), [rows, deletedIds]);

  const getCopyDelta = useCallback((): CopyDeltaPayload => {
    return computeCopyDelta(rows, deletedIds, originalRowsRef.current);
  }, [rows, deletedIds]);

  return {
    rows,
    deletedIds,
    addRow,
    updateCell,
    deleteRow,
    duplicateRow,
    reorderRows,
    validateRows,
    resetToOriginal,
    getStats,
    getCopyDelta,
  };
}

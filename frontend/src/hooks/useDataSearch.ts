import { useState, useCallback } from 'react';
import { PLMasterRow, searchRecords, fetchCompanyData } from '@/lib/plMasterTypes';

export interface SearchFilters {
  glCode?: string;
  lineItem?: string;
  erpSoftware?: string;
  isCogs?: boolean;
  isSales?: boolean;
  isDiscount?: boolean;
}

interface UseDataSearchState {
  isLoading: boolean;
  error: string | null;
  records: PLMasterRow[];
  filters: SearchFilters;
  hasSearched: boolean;
}

/**
 * Hook for managing data search and filtering
 * Supports both backend search (pre-load filtering) and in-memory filtering
 */
export function useDataSearch(companyCode: string, token: string) {
  const [state, setState] = useState<UseDataSearchState>({
    isLoading: false,
    error: null,
    records: [],
    filters: {},
    hasSearched: false,
  });

  /**
   * Apply in-memory filters to records
   * Used for: ERPSoftware, COGS/Sales/Discount flags
   */
  const applyInMemoryFilters = useCallback((records: PLMasterRow[], filters: SearchFilters): PLMasterRow[] => {
    return records.filter(record => {
      // Filter by ERP Software
      if (filters.erpSoftware && record.ERPSoftware !== filters.erpSoftware) {
        return false;
      }

      // Filter by COGS flag
      if (filters.isCogs !== undefined && record.IsCOGS !== (filters.isCogs ? 1 : 0)) {
        return false;
      }

      // Filter by Sales flag
      if (filters.isSales !== undefined && record.IsSales !== (filters.isSales ? 1 : 0)) {
        return false;
      }

      // Filter by Discount flag
      if (filters.isDiscount !== undefined && record.IsDiscount !== (filters.isDiscount ? 1 : 0)) {
        return false;
      }

      return true;
    });
  }, []);

  /**
   * Load all records for the company (no filters)
   */
  const loadAllRecords = useCallback(async () => {
    if (!token) {
      setState(prev => ({
        ...prev,
        error: 'Authentication token missing. Please log in again.',
      }));
      return;
    }
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      let records = await fetchCompanyData(companyCode, token);
      // Add _rowId to records for editing
      records = records.map((r, i) => ({
        ...r,
        _rowId: `orig-${i}`,
        _isNew: false,
        _isModified: false,
      }));
      setState(prev => ({
        ...prev,
        records,
        isLoading: false,
        filters: {},
        hasSearched: false,
      }));
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        error: err.message || 'Failed to load records',
        isLoading: false,
      }));
    }
  }, [companyCode, token]);

  /**
   * Perform a backend search with filters
   * Uses API filters: glCode, lineItem
   */
  const performBackendSearch = useCallback(
    async (filters: SearchFilters) => {
      if (!token) {
        setState(prev => ({
          ...prev,
          error: 'Authentication token missing. Please log in again.',
          isLoading: false,
        }));
        return;
      }
      
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      try {
        console.log('🔍 Searching with filters:', { companyCode, filters, hasToken: !!token });
        
        let searchResults = await searchRecords(companyCode, token, {
          glCode: filters.glCode,
          lineItem: filters.lineItem,
        });
        
        console.log('✅ Search returned:', searchResults.length, 'records');
        
        // Add _rowId to search results for editing
        searchResults = searchResults.map((r, i) => ({
          ...r,
          _rowId: `search-${i}`,
          _isNew: false,
          _isModified: false,
        }));
        
        // Apply in-memory filters for fields not supported by backend
        const filtered = applyInMemoryFilters(searchResults, filters);
        
        console.log('📊 After in-memory filters:', filtered.length, 'records');
        
        setState(prev => ({
          ...prev,
          records: filtered,
          filters,
          isLoading: false,
          hasSearched: true,
        }));
      } catch (err: any) {
        console.error('❌ Search error:', err);
        setState(prev => ({
          ...prev,
          error: err.message || 'Search failed',
          isLoading: false,
        }));
      }
    },
    [companyCode, token, applyInMemoryFilters]
  );

  /**
   * Apply only in-memory filters to current records
   * Useful for quick filtering without backend call
   */
  const applyQuickFilters = useCallback(
    (filters: SearchFilters) => {
      const filtered = applyInMemoryFilters(state.records, filters);
      setState(prev => ({
        ...prev,
        records: filtered,
        filters,
      }));
    },
    [state.records, applyInMemoryFilters]
  );

  /**
   * Reset search and clear all filters
   */
  const clearFilters = useCallback(async () => {
    await loadAllRecords();
  }, [loadAllRecords]);

  return {
    ...state,
    loadAllRecords,
    performBackendSearch,
    applyQuickFilters,
    clearFilters,
  };
}

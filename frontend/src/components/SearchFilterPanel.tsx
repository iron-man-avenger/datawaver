import { useState, useCallback } from 'react';
import { PLMasterRow } from '@/lib/plMasterTypes';
import { Input } from '@/components/ui/input';
import { X, Search } from 'lucide-react';

interface SearchBarProps {
  records: PLMasterRow[];
  onFilteredResults: (filtered: PLMasterRow[]) => void;
}

export function SearchBar({
  records,
  onFilteredResults,
}: SearchBarProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Search across all fields in real-time
  const performSearch = useCallback((query: string) => {
    if (!query.trim()) {
      // If empty, return all records
      onFilteredResults(records);
      return;
    }

    const lowerQuery = query.toLowerCase();
    
    const filtered = records.filter(record => {
      // Search across all column values
      return Object.values(record).some(value => {
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(lowerQuery);
      });
    });

    onFilteredResults(filtered);
  }, [records, onFilteredResults]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    performSearch(value);
  };

  const handleClear = () => {
    setSearchQuery('');
    onFilteredResults(records);
  };

  return (
    <div className="flex items-center gap-2 flex-1 max-w-sm">
      <div className="relative flex-1">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search records..."
          value={searchQuery}
          onChange={e => handleSearchChange(e.target.value)}
          className="h-8 text-xs pl-8 pr-8"
        />
        {searchQuery && (
          <button
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            title="Clear search"
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// Legacy export for backward compatibility
export function SearchFilterPanel({
  records,
  onFilteredResults,
  onClose,
}: {
  records: PLMasterRow[];
  onFilteredResults: (filtered: PLMasterRow[]) => void;
  onClose?: () => void;
}) {
  return <SearchBar records={records} onFilteredResults={onFilteredResults} />;
}

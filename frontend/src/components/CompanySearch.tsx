import { useState } from 'react';
import { Search, Database, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CompanySearchProps {
  onSearch: (code: string) => void;
  isLoading: boolean;
  error?: string | null;
}

export function CompanySearch({ onSearch, isLoading, error }: CompanySearchProps) {
  const [value, setValue] = useState('C077');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSearch(value.trim().toUpperCase());
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-3">
      <div className="relative flex items-center">
        <Database size={15} className="absolute left-3 text-muted-foreground" />
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Company Code (e.g. C077)"
          className={cn(
            'pl-9 pr-4 py-2 rounded-md border text-sm font-mono w-52',
            'bg-input border-border text-foreground',
            'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
            'placeholder:text-muted-foreground/50',
            'transition-all duration-200',
            error ? 'border-destructive focus:ring-destructive/50' : ''
          )}
        />
      </div>

      <button
        type="submit"
        disabled={isLoading || !value.trim()}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold',
          'bg-primary text-primary-foreground',
          'hover:bg-primary/90 transition-colors duration-200',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'shadow-sm glow-primary'
        )}
      >
        {isLoading ? (
          <>
            <span className="inline-block w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            Loading…
          </>
        ) : (
          <>
            <Search size={14} />
            Load Data
          </>
        )}
      </button>

      {error && (
        <div className="flex items-center gap-1.5 text-destructive text-sm">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}
    </form>
  );
}

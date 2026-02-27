import { ALL_COLUMNS, COLUMN_DTYPES, REQUIRED_COLUMNS, BIT_COLUMNS } from '@/lib/plMasterTypes';
import { Info } from 'lucide-react';
import { useState } from 'react';

export function ColumnInfoPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border hover:border-primary/40"
      >
        <Info size={12} />
        Column Info
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-card border border-border rounded-lg shadow-2xl w-96 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-semibold">Column Reference</span>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
          </div>
          <div className="overflow-auto max-h-80 scrollbar-dark">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Column</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Required</th>
                </tr>
              </thead>
              <tbody>
                {ALL_COLUMNS.map((col, i) => (
                  <tr key={col} className={i % 2 === 0 ? 'bg-card' : 'bg-secondary/30'}>
                    <td className="px-3 py-1.5 font-mono text-foreground">{col}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{COLUMN_DTYPES[col]}</td>
                    <td className="px-3 py-1.5">
                      {REQUIRED_COLUMNS.has(col) ? (
                        <span className="text-destructive font-medium">YES</span>
                      ) : (
                        <span className="text-muted-foreground">nullable</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

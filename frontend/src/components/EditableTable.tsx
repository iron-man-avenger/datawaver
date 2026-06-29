import { useState, useRef, useCallback, useEffect } from 'react';
import { PLMasterRow, BIT_COLUMNS, REQUIRED_COLUMNS, COLUMN_WIDTHS, ALL_COLUMNS } from '@/lib/plMasterTypes';
import { Trash2, Copy, Plus, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditableTableProps {
  rows: PLMasterRow[];
  onUpdateCell: (rowId: string, col: keyof PLMasterRow, value: string) => void;
  onDeleteRow: (rowId: string) => void;
  onDuplicateRow: (rowId: string) => void;
  onAddRowAfter: (index: number) => void;
  onReorderRows?: (fromIndex: number, toIndex: number) => void;
}

const COLUMNS = ALL_COLUMNS;

export function EditableTable({
  rows,
  onUpdateCell,
  onDeleteRow,
  onDuplicateRow,
  onAddRowAfter,
  onReorderRows,
}: EditableTableProps) {
  const [focusCell, setFocusCell] = useState<{ rowId: string; col: string } | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [draggedRowIndex, setDraggedRowIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});

  const focusCellElement = useCallback((rowId: string, col: string) => {
    const key = `${rowId}:${col}`;
    const element = cellRefs.current[key];
    if (element) {
      element.focus();
      if ('select' in element && typeof element.select === 'function') {
        element.select();
      }
    }
  }, []);

  useEffect(() => {
    if (focusCell) {
      focusCellElement(focusCell.rowId, focusCell.col);
    }
  }, [focusCell, focusCellElement]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, rowId: string, col: string, rowIndex: number, colIndex: number) => {
      const moveFocus = (targetRowIndex: number, targetColIndex: number) => {
        const nextRow = rows[targetRowIndex];
        const nextCol = COLUMNS[targetColIndex];
        if (nextRow && nextCol) {
          setFocusCell({ rowId: nextRow._rowId!, col: nextCol });
        }
      };

      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          if (colIndex > 0) {
            moveFocus(rowIndex, colIndex - 1);
          } else if (rowIndex > 0) {
            moveFocus(rowIndex - 1, COLUMNS.length - 1);
          }
          return;
        }

        if (colIndex + 1 < COLUMNS.length) {
          moveFocus(rowIndex, colIndex + 1);
        } else if (rowIndex + 1 < rows.length) {
          moveFocus(rowIndex + 1, 0);
        }
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (rowIndex + 1 < rows.length) {
          moveFocus(rowIndex + 1, colIndex);
        }
        return;
      }
    },
    [rows]
  );

  const handleDragStart = (e: React.DragEvent, rowIndex: number) => {
    setDraggedRowIndex(rowIndex);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', '');
  };

  const handleDragOver = (e: React.DragEvent, rowIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetIndex(rowIndex);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedRowIndex !== null && draggedRowIndex !== dropIndex && onReorderRows) {
      onReorderRows(draggedRowIndex, dropIndex);
    }
    setDraggedRowIndex(null);
    setDropTargetIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedRowIndex(null);
    setDropTargetIndex(null);
  };

  const getRowClass = (row: PLMasterRow) => {
    if (row._isNew) return 'row-new';
    if (row._isModified) return 'row-modified';
    return '';
  };

  const getCellClass = (col: string, row: PLMasterRow) => {
    const isRequired = REQUIRED_COLUMNS.has(col);
    const val = row[col as keyof PLMasterRow];
    const isEmpty = val === null || val === undefined || val === '';
    if (isRequired && isEmpty && (row._isNew || row._isModified)) {
      return 'border border-destructive/60 bg-destructive/10';
    }
    return '';
  };

  return (
    <div
      ref={tableRef}
      className="relative overflow-auto scrollbar-dark"
      style={{ maxHeight: 'calc(100vh - 220px)', minHeight: '300px' }}
    >
      <table className="border-collapse text-xs" style={{ minWidth: '2400px' }}>
        {/* HEADER */}
        <thead className="sticky top-0 z-20">
          <tr style={{ background: 'hsl(var(--table-header))' }}>
            {/* row number */}
            <th className="w-10 min-w-[40px] border-b border-r border-border text-center text-muted-foreground font-medium py-2 px-1 sticky left-0 z-30"
              style={{ background: 'hsl(var(--table-header))' }}>
              #
            </th>
            {/* actions */}
            <th className="w-20 min-w-[80px] border-b border-r border-border text-center text-muted-foreground font-medium py-2 px-1">
              Actions
            </th>
            {COLUMNS.map(col => (
              <th
                key={col}
                className="border-b border-r border-border text-left py-2 px-2 font-mono font-semibold text-foreground whitespace-nowrap"
                style={{ width: COLUMN_WIDTHS[col], minWidth: COLUMN_WIDTHS[col] }}
              >
                <div className="flex items-center gap-1">
                  <span>{col}</span>
                  {REQUIRED_COLUMNS.has(col) && (
                    <span className="text-destructive text-[10px]">*</span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground font-normal mt-0.5 font-sans">
                  {col === 'UniqueID' ? 'varchar(255)' :
                   BIT_COLUMNS.has(col) ? 'bit (0/1)' :
                   col.includes('Formula') ? 'varchar(MAX)' :
                   col.length < 10 ? 'varchar' : 'nvarchar'}
                </div>
              </th>
            ))}
          </tr>
        </thead>

        {/* BODY */}
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length + 2} className="text-center text-muted-foreground py-12">
                No rows. Click "+ Add Row" to get started.
              </td>
            </tr>
          )}
          {rows.map((row, rowIndex) => (
            <tr
              key={row._rowId}
              className={cn(
                'group border-b border-border transition-colors duration-100',
                getRowClass(row),
                !row._isNew && !row._isModified && rowIndex % 2 === 0
                  ? 'bg-card'
                  : !row._isNew && !row._isModified
                  ? ''
                  : '',
                hoveredRow === row._rowId && !row._isNew && !row._isModified
                  ? 'bg-secondary/60'
                  : '',
                draggedRowIndex === rowIndex ? 'opacity-50' : '',
                dropTargetIndex === rowIndex ? 'border-t-2 border-t-primary' : ''
              )}
              onMouseEnter={() => setHoveredRow(row._rowId!)}
              onMouseLeave={() => setHoveredRow(null)}
            >
              {/* Row number */}
              <td
                className="border-r border-border text-center text-muted-foreground py-0 px-1 sticky left-0 z-10 select-none"
                style={{ background: 'inherit', minWidth: '40px' }}
              >
                <div className="flex items-center justify-center h-full py-1">
                  {row._isNew ? (
                    <span className="text-[10px] font-bold text-success px-1 py-0.5 rounded bg-success/20">NEW</span>
                  ) : (
                    <span className="font-mono">{rowIndex + 1}</span>
                  )}
                </div>
              </td>

              {/* Action buttons */}
              <td className="border-r border-border py-0 px-1">
                <div className="flex items-center justify-center gap-0.5">
                  {/* Drag handle - always visible */}
                  <button
                    draggable
                    onDragStart={(e) => handleDragStart(e, rowIndex)}
                    onDragOver={(e) => handleDragOver(e, rowIndex)}
                    onDrop={(e) => handleDrop(e, rowIndex)}
                    onDragEnd={handleDragEnd}
                    className="p-1 rounded hover:bg-muted/40 hover:text-muted-foreground transition-colors cursor-grab active:cursor-grabbing"
                    title="Drag to reorder row"
                  >
                    <GripVertical size={12} />
                  </button>

                  {/* Other actions - hidden until hover */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onAddRowAfter(rowIndex)}
                      className="p-1 rounded hover:bg-primary/20 hover:text-primary transition-colors"
                      title="Insert row below"
                    >
                      <Plus size={12} />
                    </button>
                    <button
                      onClick={() => onDuplicateRow(row._rowId!)}
                      className="p-1 rounded hover:bg-accent/20 hover:text-accent transition-colors"
                      title="Duplicate row"
                    >
                      <Copy size={12} />
                    </button>
                    <button
                      onClick={() => onDeleteRow(row._rowId!)}
                      className="p-1 rounded hover:bg-destructive/20 hover:text-destructive transition-colors"
                      title="Delete row"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </td>

              {/* Data cells */}
              {COLUMNS.map((col, colIndex) => {
                const isBit = BIT_COLUMNS.has(col);
                const val = row[col as keyof PLMasterRow];
                const displayVal = val === null || val === undefined ? '' : String(val);
                const isFocused = focusCell?.rowId === row._rowId && focusCell?.col === col;

                return (
                  <td
                    key={col}
                    className={cn(
                      'border-r border-border py-0 px-0 relative',
                      getCellClass(col, row)
                    )}
                    style={{ width: COLUMN_WIDTHS[col], minWidth: COLUMN_WIDTHS[col] }}
                    onClick={() => setFocusCell({ rowId: row._rowId!, col })}
                  >
                    {isBit ? (
                      <select
                        value={displayVal}
                        onChange={e => onUpdateCell(row._rowId!, col as keyof PLMasterRow, e.target.value)}
                        ref={(element) => {
                          cellRefs.current[`${row._rowId}:${col}`] = element;
                        }}
                        onFocus={() => setFocusCell({ rowId: row._rowId!, col })}
                        onKeyDown={e => handleKeyDown(e, row._rowId!, col, rowIndex, colIndex)}
                        className={cn(
                          'w-full h-7 bg-transparent px-2 text-xs font-mono outline-none cursor-pointer',
                          'hover:bg-secondary/40 focus:bg-secondary focus:ring-1 focus:ring-primary/50',
                          displayVal === '1' ? 'text-success' : displayVal === '0' ? 'text-muted-foreground' : 'text-muted-foreground/50'
                        )}
                      >
                        <option value="">NULL</option>
                        <option value="0">0</option>
                        <option value="1">1</option>
                      </select>
                    ) : (
                      <input
                        ref={(element) => {
                          cellRefs.current[`${row._rowId}:${col}`] = element;
                        }}
                        value={displayVal}
                        onChange={e => onUpdateCell(row._rowId!, col as keyof PLMasterRow, e.target.value)}
                        onFocus={() => setFocusCell({ rowId: row._rowId!, col })}
                        onKeyDown={e => handleKeyDown(e, row._rowId!, col, rowIndex, colIndex)}
                        placeholder={REQUIRED_COLUMNS.has(col) ? 'required' : 'null'}
                        className={cn(
                          'w-full h-7 bg-transparent px-2 outline-none font-mono text-xs',
                          'hover:bg-secondary/30 focus:bg-secondary focus:ring-1 focus:ring-inset focus:ring-primary/60',
                          'placeholder:text-muted-foreground/30',
                          REQUIRED_COLUMNS.has(col) ? 'placeholder:text-destructive/40' : ''
                        )}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

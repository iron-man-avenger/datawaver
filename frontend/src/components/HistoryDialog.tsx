import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface AuditLog {
  serial: number;
  id: number;
  company_code: string;
  record_id: string;
  username: string;
  change_type: string;
  timestamp: string;
  field_changes?: Array<{
    field: string;
    old: string | null;
    new: string | null;
  }>;
}

interface RecordChange {
  recordId: string;
  changeType: string;
  timestamp: string;
  username: string;
  fields: Array<{
    fieldName: string;
    oldValue: string | null;
    newValue: string | null;
  }>;
}

interface HistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  companyCode: string;
  recordId?: string;
  showAllHistory?: boolean;
}

export const HistoryDialog: React.FC<HistoryDialogProps> = ({
  isOpen,
  onClose,
  companyCode,
  recordId,
  showAllHistory = false,
}) => {
  const { token } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [recordChanges, setRecordChanges] = useState<RecordChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedRecords, setExpandedRecords] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, companyCode, recordId, token, showAllHistory]);

  const loadHistory = async () => {
    setLoading(true);
    setError('');
    setLogs([]);
    setRecordChanges([]);

    try {
      // Use the new user-history endpoint for current user
      const endpoint = showAllHistory ? 'audit/all-history' : 'audit/user-history';
      let url = `http://localhost:8015/datawaverapi/${endpoint}`;
      
      // Add optional filters
      const params = new URLSearchParams();
      if (companyCode) params.append('company_code', companyCode);
      if (recordId) params.append('record_id', recordId);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load history');
      }

      const data = await response.json();
      const allLogs = data.logs || [];
      
      // Filter to only show INSERT and UPDATE actions
      const filteredLogs = allLogs.filter((log: AuditLog) => 
        log.change_type === 'INSERT' || log.change_type === 'UPDATE'
      );
      
      setLogs(filteredLogs);
      
      // Group changes by record and timestamp
      const grouped: { [key: string]: RecordChange } = {};
      
      filteredLogs.forEach((log: AuditLog) => {
        const key = `${log.record_id}-${log.timestamp}`;
        
        if (!grouped[key]) {
          grouped[key] = {
            recordId: log.record_id,
            changeType: log.change_type,
            timestamp: log.timestamp,
            username: log.username,
            fields: [],
          };
        }
        
        // Handle field_changes from new local audit format
        if (log.field_changes && Array.isArray(log.field_changes)) {
          log.field_changes.forEach((fc) => {
            grouped[key].fields.push({
              fieldName: fc.field,
              oldValue: fc.old,
              newValue: fc.new,
            });
          });
        }
      });
      
      const changes = Object.values(grouped).sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      
      setRecordChanges(changes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (recordId: string) => {
    const newExpanded = new Set(expandedRecords);
    if (newExpanded.has(recordId)) {
      newExpanded.delete(recordId);
    } else {
      newExpanded.add(recordId);
    }
    setExpandedRecords(newExpanded);
  };

  const getChangeTypeBadgeColor = (changeType: string) => {
    switch (changeType) {
      case 'INSERT':
        return 'bg-green-500/20 text-green-300 border border-green-500/30';
      case 'UPDATE':
        return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
      case 'DELETE':
        return 'bg-red-500/20 text-red-300 border border-red-500/30';
      default:
        return 'bg-zinc-500/20 text-zinc-300 border border-zinc-500/30';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-zinc-900 border-zinc-800 rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-white text-2xl">Change History</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {recordId ? `Record: ${recordId}` : `Company: ${companyCode}`} • Showing {recordChanges.length} {recordChanges.length === 1 ? 'change' : 'changes'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="bg-red-950/50 border-red-900/50 rounded-lg">
            <AlertDescription className="text-red-200">{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
              <p className="text-zinc-400">Loading history...</p>
            </div>
          </div>
        ) : recordChanges.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <p className="text-zinc-400 text-lg">No changes recorded</p>
              <p className="text-zinc-600 text-sm mt-1">All data appears to be in its original state</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {recordChanges.map((record) => (
              <div
                key={`${record.recordId}-${record.timestamp}`}
                className="border border-zinc-700/50 rounded-lg bg-zinc-800/30 overflow-hidden hover:bg-zinc-800/50 transition-colors"
              >
                {/* Header */}
                <button
                  onClick={() => toggleExpanded(record.recordId)}
                  className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/40 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1 text-left">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <Badge className={`${getChangeTypeBadgeColor(record.changeType)} text-xs font-semibold`}>
                          {record.changeType === 'INSERT' ? '✨ Created' : '✏️ Updated'}
                        </Badge>
                        <span className="font-mono text-sm text-zinc-300 bg-zinc-900/50 px-3 py-1 rounded">
                          {record.recordId}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-zinc-400">
                        <span>By <span className="text-zinc-200 font-medium">{record.username}</span></span>
                        <span>•</span>
                        <span>{new Date(record.timestamp).toLocaleString()}</span>
                        <span>•</span>
                        <span>{record.fields.length} field{record.fields.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>
                  <div className="ml-4 text-zinc-500">
                    {expandedRecords.has(record.recordId) ? (
                      <ChevronUp size={20} />
                    ) : (
                      <ChevronDown size={20} />
                    )}
                  </div>
                </button>

                {/* Expanded Content - Changes Detail */}
                {expandedRecords.has(record.recordId) && (
                  <div className="border-t border-zinc-700/50 bg-zinc-900/40 p-4">
                    {record.fields.length === 0 ? (
                      <p className="text-zinc-500 text-sm italic">No field changes recorded</p>
                    ) : (
                      <div className="space-y-3">
                        {record.fields.map((field, idx) => (
                          <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 rounded bg-zinc-900/60 border border-zinc-700/30">
                            {/* Field Name */}
                            <div>
                              <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-1">Field</p>
                              <p className="text-sm font-mono text-zinc-300 bg-zinc-800/50 px-3 py-2 rounded">
                                {field.fieldName}
                              </p>
                            </div>

                            {/* Old Value */}
                            <div>
                              <p className="text-xs text-red-500 uppercase tracking-wider font-semibold mb-1">Before</p>
                              <div className="min-h-[40px] flex items-center">
                                {field.oldValue ? (
                                  <div className="text-sm text-zinc-300 bg-red-950/30 border border-red-900/50 px-3 py-2 rounded w-full font-mono break-words">
                                    {field.oldValue}
                                  </div>
                                ) : (
                                  <span className="text-xs text-zinc-600 italic">—</span>
                                )}
                              </div>
                            </div>

                            {/* New Value */}
                            <div>
                              <p className="text-xs text-green-500 uppercase tracking-wider font-semibold mb-1">After</p>
                              <div className="min-h-[40px] flex items-center">
                                {field.newValue ? (
                                  <div className="text-sm text-zinc-300 bg-green-950/30 border border-green-900/50 px-3 py-2 rounded w-full font-mono break-words">
                                    {field.newValue}
                                  </div>
                                ) : (
                                  <span className="text-xs text-zinc-600 italic">—</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Summary Footer */}
        {recordChanges.length > 0 && (
          <div className="mt-6 pt-4 border-t border-zinc-700/50 flex items-center justify-between text-sm text-zinc-400">
            <div>
              Total changes: <span className="text-white font-semibold">{recordChanges.length}</span>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500/40"></div>
                <span>{recordChanges.filter(r => r.changeType === 'INSERT').length} Created</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500/40"></div>
                <span>{recordChanges.filter(r => r.changeType === 'UPDATE').length} Updated</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

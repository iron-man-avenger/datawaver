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

interface AuditLog {
  serial: number;
  id: number;
  company_code: string;
  record_id: string;
  username: string;
  change_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  timestamp: string;
}

interface HistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  companyCode: string;
  recordId?: string;
}

export const HistoryDialog: React.FC<HistoryDialogProps> = ({
  isOpen,
  onClose,
  companyCode,
  recordId,
}) => {
  const { token } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, companyCode, recordId, token]);

  const loadHistory = async () => {
    setLoading(true);
    setError('');
    setLogs([]);

    try {
      let url = `http://localhost:8015/datawaverapi/audit/`;
      
      if (recordId) {
        url += `record/${recordId}`;
      } else {
        url += `history?company_code=${companyCode}`;
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
      setLogs(data.logs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const getChangeTypeBadgeColor = (changeType: string) => {
    switch (changeType) {
      case 'INSERT':
        return 'bg-green-100 text-green-800';
      case 'UPDATE':
        return 'bg-blue-100 text-blue-800';
      case 'DELETE':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Change History</DialogTitle>
          <DialogDescription>
            {recordId ? `Record: ${recordId}` : `Company: ${companyCode}`}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-gray-500">Loading history...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-gray-500">No changes recorded</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Record ID</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Old Value</TableHead>
                  <TableHead>New Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium text-sm">{log.serial}</TableCell>
                    <TableCell className="text-sm">
                      {new Date(log.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{log.username}</TableCell>
                    <TableCell>
                      <Badge className={getChangeTypeBadgeColor(log.change_type)}>
                        {log.change_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{log.record_id}</TableCell>
                    <TableCell className="text-sm">{log.field_name || '-'}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate">
                      {log.old_value ? (
                        <span className="bg-red-50 text-red-800 px-2 py-1 rounded text-xs">
                          {log.old_value}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-sm max-w-xs truncate">
                      {log.new_value ? (
                        <span className="bg-green-50 text-green-800 px-2 py-1 rounded text-xs">
                          {log.new_value}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

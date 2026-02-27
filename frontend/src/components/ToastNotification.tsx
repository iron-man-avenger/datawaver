import { cn } from '@/lib/utils';
import { CheckCircle, AlertCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ToastNotificationProps {
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
  onClose: () => void;
  duration?: number;
}

export function ToastNotification({ type, title, message, onClose, duration = 5000 }: ToastNotificationProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, duration);
    return () => clearTimeout(t);
  }, [duration, onClose]);

  return (
    <div
      className={cn(
        'fixed bottom-6 right-6 z-50 flex items-start gap-3 px-4 py-3 rounded-lg border shadow-xl max-w-sm',
        'transition-all duration-300',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        type === 'success' ? 'bg-card border-success/40 text-foreground' :
        type === 'error' ? 'bg-card border-destructive/40 text-foreground' :
        'bg-card border-primary/40 text-foreground'
      )}
    >
      {type === 'success' && <CheckCircle size={18} className="text-success mt-0.5 shrink-0" />}
      {type === 'error' && <AlertCircle size={18} className="text-destructive mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{title}</p>
        {message && <p className="text-muted-foreground text-xs mt-0.5 whitespace-pre-line">{message}</p>}
      </div>
      <button onClick={onClose} className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0">
        <X size={14} />
      </button>
    </div>
  );
}

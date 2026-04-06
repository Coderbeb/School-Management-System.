'use client';

import { Wifi, WifiOff, CloudUpload, CheckCircle, AlertCircle, CloudOff } from 'lucide-react';

interface Toast {
  id: number;
  type: 'offline' | 'online' | 'syncing' | 'synced' | 'queued' | 'error';
  message: string;
}

interface OfflineToastProps {
  toasts: Toast[];
  onRemove: (id: number) => void;
}

const toastConfig = {
  offline: {
    icon: WifiOff,
    bg: 'bg-red-600',
    iconColor: 'text-red-100',
  },
  online: {
    icon: Wifi,
    bg: 'bg-green-600',
    iconColor: 'text-green-100',
  },
  syncing: {
    icon: CloudUpload,
    bg: 'bg-blue-600',
    iconColor: 'text-blue-100',
  },
  synced: {
    icon: CheckCircle,
    bg: 'bg-green-600',
    iconColor: 'text-green-100',
  },
  queued: {
    icon: CloudOff,
    bg: 'bg-amber-600',
    iconColor: 'text-amber-100',
  },
  error: {
    icon: AlertCircle,
    bg: 'bg-red-600',
    iconColor: 'text-red-100',
  },
};

export function OfflineToast({ toasts, onRemove }: OfflineToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 sm:top-6 sm:right-6 z-[99999] flex flex-col items-end gap-2 sm:gap-3 pointer-events-none">
      {toasts.map((toast) => {
        const config = toastConfig[toast.type];
        const Icon = config.icon;

        return (
          <div
            key={toast.id}
            className={`${config.bg} text-white rounded-lg sm:rounded-xl px-3 py-2 sm:px-4 sm:py-3 shadow-2xl flex items-center gap-2 sm:gap-3 pointer-events-auto animate-slide-up w-auto max-w-[85vw] sm:max-w-md`}
            onClick={() => onRemove(toast.id)}
            role="alert"
          >
            <div className={`${config.iconColor} shrink-0`}>
              <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${toast.type === 'syncing' ? 'animate-pulse' : ''}`} />
            </div>
            <p className="text-[11px] leading-snug sm:text-sm font-medium flex-1">{toast.message}</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(toast.id);
              }}
              className="text-white/70 hover:text-white text-base sm:text-lg leading-none shrink-0 p-1"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

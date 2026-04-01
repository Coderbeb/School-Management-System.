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
    <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2 w-[90vw] max-w-sm sm:w-auto pointer-events-none">
      {toasts.map((toast) => {
        const config = toastConfig[toast.type];
        const Icon = config.icon;

        return (
          <div
            key={toast.id}
            className={`${config.bg} text-white rounded-xl px-4 py-3 shadow-2xl flex items-center gap-3 pointer-events-auto animate-slide-up`}
            onClick={() => onRemove(toast.id)}
            role="alert"
          >
            <div className={`${config.iconColor} shrink-0`}>
              <Icon className={`w-5 h-5 ${toast.type === 'syncing' ? 'animate-pulse' : ''}`} />
            </div>
            <p className="text-sm font-medium flex-1">{toast.message}</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(toast.id);
              }}
              className="text-white/60 hover:text-white text-lg leading-none shrink-0"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

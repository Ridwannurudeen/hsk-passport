"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const colors = {
    success: "bg-green-900/90 border-green-700 text-green-100",
    error: "bg-red-900/90 border-red-700 text-red-100",
    info: "bg-gray-900/90 border-gray-700 text-gray-100",
  };

  const icons = {
    success: "✓",
    error: "✕",
    info: "i",
  };

  return (
    <div
      className={`${colors[toast.type]} border rounded-lg px-4 py-3 text-sm shadow-lg backdrop-blur-sm transition-all duration-300 cursor-pointer ${
        visible ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"
      }`}
      onClick={onDismiss}
    >
      <span className="font-bold mr-2">{icons[toast.type]}</span>
      {toast.message}
    </div>
  );
}

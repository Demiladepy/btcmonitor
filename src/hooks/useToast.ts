import { useState, useCallback } from "react";

export type ToastType = "success" | "error" | "pending" | "info";

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

let nextId = 1;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const add = useCallback((type: ToastType, message: string, duration = 5000) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, type, message }]);
    if (type !== "pending") {
      setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id));
      }, duration);
    }
    return id;
  }, []);

  const update = useCallback((id: number, type: ToastType, message: string, duration = 5000) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, type, message } : x)));
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, duration);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  return { toasts, add, update, remove };
}

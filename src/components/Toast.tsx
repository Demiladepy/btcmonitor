import type { Toast, ToastType } from "../hooks/useToast";

interface Props {
  toasts: Toast[];
  remove: (id: number) => void;
}

function icon(type: ToastType) {
  if (type === "success") return "✓";
  if (type === "error") return "✕";
  if (type === "pending") return null;
  return "ℹ";
}
function color(type: ToastType) {
  if (type === "success") return "var(--green)";
  if (type === "error") return "var(--red)";
  if (type === "pending") return "var(--blue)";
  return "var(--text2)";
}

export function ToastContainer({ toasts, remove }: Props) {
  if (!toasts.length) return null;
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className="toast" style={{ borderLeftColor: color(t.type) }}>
          <span className="toast-icon" style={{ color: color(t.type) }}>
            {t.type === "pending"
              ? <span className="spinner-sm" />
              : icon(t.type)}
          </span>
          <span className="toast-msg">{t.message}</span>
          <button className="toast-close" onClick={() => remove(t.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}

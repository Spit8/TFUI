import { useToasts } from "../store/toastStore";
import "./ToastHost.css";

export function ToastHost() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="toast-host" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone ?? "info"}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

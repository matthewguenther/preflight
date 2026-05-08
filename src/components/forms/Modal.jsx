import { X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export function Modal({ isOpen, onClose, title, children }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="tactical-modal-host fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-stone-950/60 p-3 backdrop-blur-sm sm:p-6" onMouseDown={onClose}>
      <div
        className="tactical-modal flex w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        style={{ maxHeight: 'calc(100vh - 1.5rem)' }}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-stone-200 p-5 pb-4">
          <div className="flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-stone-950">{title}</h3>
          <button className="rounded-md p-2 text-stone-500 hover:bg-stone-100" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
          </div>
        </div>
        <div className="modal-scroll-body min-h-0 flex-1 p-5">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

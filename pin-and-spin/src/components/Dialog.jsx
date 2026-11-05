import React, { useEffect, useRef } from 'react';

// In-game replacement for the browser's confirm()/prompt() pop-ups.
//   confirm: <Dialog title message confirmLabel danger onConfirm onCancel />
//   copy:    <Dialog title copyText onCancel />  (when the clipboard is blocked)
export function Dialog({ title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false, copyText, onConfirm, onCancel }) {
  const firstRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    firstRef.current?.focus();
    if (copyText) firstRef.current?.select?.();
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, [copyText, onCancel]);
  return <div className="dialog-backdrop" onClick={onCancel}>
    <div className="dialog surface" role={onConfirm ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="dialog-title"
      onClick={(e) => e.stopPropagation()}>
      <h2 id="dialog-title">{title}</h2>
      {message && <p>{message}</p>}
      {copyText && <input ref={firstRef} className="dialog-copy" readOnly value={copyText} aria-label="Text to copy"
        onFocus={(e) => e.target.select()} />}
      <div className="dialog-actions">
        {onConfirm
          ? <>
            <button type="button" className="outline-btn" onClick={onCancel}>{cancelLabel}</button>
            <button type="button" ref={copyText ? undefined : firstRef} className={'primary-btn' + (danger ? ' danger-btn' : '')} onClick={onConfirm}>{confirmLabel}</button>
          </>
          : <button type="button" ref={copyText ? undefined : firstRef} className="primary-btn" onClick={onCancel}>Done</button>}
      </div>
    </div>
  </div>;
}

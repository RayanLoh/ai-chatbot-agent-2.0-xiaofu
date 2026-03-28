import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import '../styles/DeleteConfirmModal.css';

const EXIT_ANIMATION_MS = 220;

function DeleteConfirmModal({
  isOpen,
  conversationTitle,
  isDeleting,
  onCancel,
  onConfirm,
}) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      requestAnimationFrame(() => setIsVisible(true));
      return undefined;
    }

    setIsVisible(false);
    const timeoutId = window.setTimeout(() => {
      setShouldRender(false);
    }, EXIT_ANIMATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [isOpen]);

  useEffect(() => {
    if (!shouldRender) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isDeleting) {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDeleting, onCancel, shouldRender]);

  if (!shouldRender) {
    return null;
  }

  const safeTitle = conversationTitle || 'this conversation';

  return createPortal(
    <div
      className={`delete-confirm-backdrop ${isVisible ? 'visible' : 'hidden'}`}
      onClick={() => {
        if (!isDeleting) {
          onCancel();
        }
      }}
    >
      <div
        className={`delete-confirm-modal ${isVisible ? 'visible' : 'hidden'}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
      >
        <div className="delete-confirm-orb" aria-hidden="true" />
        <p className="delete-confirm-eyebrow">Delete Conversation</p>
        <h3 id="delete-confirm-title">Remove "{safeTitle}"?</h3>
        <p className="delete-confirm-copy">
          This will permanently delete the conversation and its messages from your history.
        </p>

        <div className="delete-confirm-actions">
          <button
            type="button"
            className="delete-confirm-secondary"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Keep it
          </button>
          <button
            type="button"
            className="delete-confirm-primary"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default DeleteConfirmModal;
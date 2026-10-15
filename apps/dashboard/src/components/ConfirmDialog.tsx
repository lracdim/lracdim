import { Show, createEffect, createUniqueId, onCleanup, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { createFocusTrap } from '~/lib/focusTrap';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Explanatory copy, or any JSX the decision needs. */
  body?: JSX.Element;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  destructive?: boolean;
  /** Disables the confirm button while a mutation is in flight. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Accessible modal: role="dialog", aria-modal, labelled by its title and
 * described by its body, focus trapped, Escape closes, focus returns to the
 * trigger.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const titleId = createUniqueId();
  const bodyId = createUniqueId();
  let panel: HTMLDivElement | undefined;
  let confirmButton: HTMLButtonElement | undefined;

  createEffect(() => {
    if (!props.open || !panel) return;

    const release = createFocusTrap(panel, {
      onEscape: () => props.onCancel(),
      initialFocus: () => confirmButton,
    });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    onCleanup(() => {
      document.body.style.overflow = previousOverflow;
      release();
    });
  });

  return (
    <Show when={props.open}>
      <Portal>
        {/* The scrim is decorative; Escape and Cancel are the documented exits. */}
        <div class="dialog-scrim" onClick={(event) => {
          if (event.target === event.currentTarget) props.onCancel();
        }}>
          <div
            class="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={props.body ? bodyId : undefined}
            tabindex="-1"
            ref={panel}
          >
            <div class="dialog__head">
              <h2 class="dialog__title" id={titleId}>
                {props.title}
              </h2>
            </div>
            <Show when={props.body}>
              <div class="dialog__body" id={bodyId}>
                {props.body}
              </div>
            </Show>
            <div class="dialog__foot">
              <button
                type="button"
                class="btn btn--quiet"
                onClick={() => props.onCancel()}
                disabled={props.busy}
              >
                {props.cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                class={props.destructive ? 'btn btn--danger' : 'btn btn--primary'}
                onClick={() => props.onConfirm()}
                disabled={props.busy}
                ref={confirmButton}
              >
                {props.busy ? 'Working...' : (props.confirmLabel ?? 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

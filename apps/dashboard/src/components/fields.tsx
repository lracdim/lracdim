/**
 * Form controls. Each one wires label, hint, error text and aria-invalid /
 * aria-describedby so a mistake is announced rather than only coloured red.
 */

import { Show, createUniqueId, splitProps, type JSX } from 'solid-js';

interface FieldFrameProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Lays the field out for a filter bar rather than a form column. */
  inline?: boolean;
  children: JSX.Element;
}

function FieldFrame(props: FieldFrameProps) {
  return (
    <div class={props.inline ? 'field field--inline' : 'field'}>
      <label class="field__label" for={props.id}>
        {props.label}
        <Show when={props.required}>
          {' '}
          <span class="field__required" aria-hidden="true">
            *
          </span>
          <span class="visually-hidden"> (required)</span>
        </Show>
      </label>
      {props.children}
      <Show when={props.hint && !props.error}>
        <span class="field__hint" id={`${props.id}-hint`}>
          {props.hint}
        </span>
      </Show>
      <Show when={props.error}>
        <span class="field__error" id={`${props.id}-error`}>
          {props.error}
        </span>
      </Show>
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  const parts: string[] = [];
  if (error) parts.push(`${id}-error`);
  else if (hint) parts.push(`${id}-hint`);
  return parts.length ? parts.join(' ') : undefined;
}

/* -- TextField ---------------------------------------------------------- */

export interface TextFieldProps
  extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'id' | 'class'> {
  label: string;
  hint?: string;
  error?: string;
  inline?: boolean;
}

export function TextField(props: TextFieldProps) {
  const id = createUniqueId();
  const [local, rest] = splitProps(props, ['label', 'hint', 'error', 'inline']);

  return (
    <FieldFrame
      id={id}
      label={local.label}
      hint={local.hint}
      error={local.error}
      required={Boolean(props.required)}
      inline={local.inline}
    >
      <input
        {...rest}
        id={id}
        class="field__control"
        type={props.type ?? 'text'}
        aria-invalid={local.error ? 'true' : undefined}
        aria-describedby={describedBy(id, local.hint, local.error)}
      />
    </FieldFrame>
  );
}

/* -- SelectField -------------------------------------------------------- */

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps
  extends Omit<JSX.SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'class' | 'children'> {
  label: string;
  hint?: string;
  error?: string;
  inline?: boolean;
  options: SelectOption[];
}

export function SelectField(props: SelectFieldProps) {
  const id = createUniqueId();
  const [local, rest] = splitProps(props, ['label', 'hint', 'error', 'inline', 'options']);

  return (
    <FieldFrame
      id={id}
      label={local.label}
      hint={local.hint}
      error={local.error}
      required={Boolean(props.required)}
      inline={local.inline}
    >
      <select
        {...rest}
        id={id}
        class="field__control"
        aria-invalid={local.error ? 'true' : undefined}
        aria-describedby={describedBy(id, local.hint, local.error)}
      >
        {local.options.map((option) => (
          <option value={option.value}>{option.label}</option>
        ))}
      </select>
    </FieldFrame>
  );
}

/* -- TextArea ----------------------------------------------------------- */

export interface TextAreaProps
  extends Omit<JSX.TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'class'> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextArea(props: TextAreaProps) {
  const id = createUniqueId();
  const [local, rest] = splitProps(props, ['label', 'hint', 'error']);

  return (
    <FieldFrame
      id={id}
      label={local.label}
      hint={local.hint}
      error={local.error}
      required={Boolean(props.required)}
    >
      <textarea
        {...rest}
        id={id}
        class="field__control"
        aria-invalid={local.error ? 'true' : undefined}
        aria-describedby={describedBy(id, local.hint, local.error)}
      />
    </FieldFrame>
  );
}

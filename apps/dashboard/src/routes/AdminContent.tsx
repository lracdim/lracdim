import { For, Show, createEffect, createSignal } from 'solid-js';
import { useContentItems, useSaveContentItem } from '~/api/hooks/useContent';
import { ContentStatusBadge } from '~/components/Badge';
import { EmptyState } from '~/components/EmptyState';
import { QueryView } from '~/components/QueryView';
import { SelectField, TextArea, TextField } from '~/components/fields';
import { formatDateTime } from '~/lib/format';
import type { ContentCollection, ContentStatus } from '~/lib/types';

const COLLECTION_OPTIONS = [
  { value: 'page', label: 'Page' },
  { value: 'project', label: 'Project' },
  { value: 'service', label: 'Service' },
  { value: 'blog', label: 'Blog' },
];

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'review', label: 'Review' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

const COLLECTION_FILTER = [{ value: 'all', label: 'All collections' }, ...COLLECTION_OPTIONS];

interface FormState {
  id?: string;
  collection: ContentCollection;
  title: string;
  slug: string;
  status: ContentStatus;
  body: string;
}

const BLANK: FormState = {
  collection: 'page',
  title: '',
  slug: '',
  status: 'draft',
  body: '',
};

/**
 * Content editor for the public Eleventy site.
 *
 * TODO(cms): the list, preview and save all run against the mock layer today.
 * src/api/resources/content.ts is the single place to point at the real CMS
 * API; this component should not need to change when it does.
 */
export function AdminContent() {
  const [collectionFilter, setCollectionFilter] = createSignal<ContentCollection | 'all'>('all');
  const items = useContentItems(() => ({ collection: collectionFilter() }));
  const save = useSaveContentItem();

  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [form, setForm] = createSignal<FormState>(BLANK);
  const [touched, setTouched] = createSignal(false);
  const [saved, setSaved] = createSignal<string | null>(null);
  const [saveError, setSaveError] = createSignal<string | null>(null);

  const selected = () =>
    (items.data ?? []).find((item) => item.id === selectedId()) ?? undefined;

  // Load the selected item into the form.
  createEffect(() => {
    const item = selected();
    if (!item) return;
    setForm({
      id: item.id,
      collection: item.collection,
      title: item.title,
      slug: item.slug,
      status: item.status,
      body: item.body,
    });
    setTouched(false);
    setSaveError(null);
  });

  function startNew() {
    setSelectedId(null);
    setForm({ ...BLANK });
    setTouched(false);
    setSaved(null);
    setSaveError(null);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm({ ...form(), [key]: value });
    setTouched(true);
    setSaved(null);
  }

  const titleError = () =>
    touched() && !form().title.trim() ? 'A title is required.' : undefined;

  const slugError = () => {
    if (!touched()) return undefined;
    const slug = form().slug.trim();
    if (!slug) return 'A slug is required.';
    if (!/^[a-z0-9]+(?:[-/][a-z0-9]+)*$/.test(slug)) {
      return 'Lowercase letters, numbers, hyphens and slashes only.';
    }
    return undefined;
  };

  const canSave = () =>
    Boolean(form().title.trim()) && !slugErrorFor(form().slug) && !save.isPending;

  function slugErrorFor(slug: string): boolean {
    const value = slug.trim();
    return !value || !/^[a-z0-9]+(?:[-/][a-z0-9]+)*$/.test(value);
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setTouched(true);
    if (!canSave()) return;
    setSaveError(null);

    try {
      const result = await save.mutateAsync({
        id: form().id,
        collection: form().collection,
        title: form().title.trim(),
        slug: form().slug.trim(),
        status: form().status,
        body: form().body,
      });
      setSelectedId(result.id);
      setSaved(`Saved at ${formatDateTime(result.updatedAt)}`);
      setTouched(false);
    } catch (error) {
      const message =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'The item could not be saved.';
      setSaveError(message);
    }
  }

  return (
    <>
      <div class="page-head">
        <div>
          <span class="label label--signal">Public site</span>
          <h1>Content</h1>
          <p>
            Pages, project write-ups, services and notes for the marketing site. Edits
            are held in this session only until the CMS API is connected.
          </p>
        </div>
        <div class="page-actions">
          <button type="button" class="btn btn--primary" onClick={startNew}>
            New item
          </button>
        </div>
      </div>

      <div class="grid grid--split">
        <section aria-labelledby="content-list-heading">
          <h2 id="content-list-heading" class="visually-hidden">
            Content items
          </h2>

          <div class="filterbar">
            <label class="field field--inline">
              <span class="field__label">Collection</span>
              <select
                class="field__control"
                value={collectionFilter()}
                onChange={(event) =>
                  setCollectionFilter(event.currentTarget.value as ContentCollection | 'all')
                }
              >
                <For each={COLLECTION_FILTER}>
                  {(option) => <option value={option.value}>{option.label}</option>}
                </For>
              </select>
            </label>
          </div>

          <QueryView
            query={items}
            loadingLabel="Loading content items"
            isEmpty={(rows) => rows.length === 0}
            emptyTitle="No content in this collection"
            emptyBody="Create an item to get started."
          >
            {(rows) => (
              <div class="content-list">
                <For each={rows()}>
                  {(item) => (
                    <button
                      type="button"
                      class="content-list__item"
                      aria-current={selectedId() === item.id ? 'true' : undefined}
                      onClick={() => {
                        setSelectedId(item.id);
                        setSaved(null);
                      }}
                    >
                      <span>
                        <span class="content-list__title">{item.title}</span>
                        <span class="content-list__slug">/{item.slug}</span>
                      </span>
                      <span class="row stack--tight" style={{ 'flex-direction': 'column', 'align-items': 'flex-end' }}>
                        <ContentStatusBadge status={item.status} />
                        <span class="label">{item.collection}</span>
                      </span>
                    </button>
                  )}
                </For>
              </div>
            )}
          </QueryView>
        </section>

        <aside class="stack" aria-labelledby="content-editor-heading">
          <h2 id="content-editor-heading" class="visually-hidden">
            Editor and preview
          </h2>

          <form class="panel" onSubmit={handleSubmit} novalidate>
            <div class="panel__head">
              <h3>{form().id ? 'Edit item' : 'New item'}</h3>
              <Show when={form().id}>
                <span class="label num">{form().id}</span>
              </Show>
            </div>
            <div class="panel__body">
              <TextField
                label="Title"
                required
                value={form().title}
                error={titleError()}
                onInput={(event) => update('title', event.currentTarget.value)}
              />
              <TextField
                label="Slug"
                required
                value={form().slug}
                hint="Path on the public site, without a leading slash."
                error={slugError()}
                onInput={(event) => update('slug', event.currentTarget.value)}
              />
              <SelectField
                label="Collection"
                options={COLLECTION_OPTIONS}
                value={form().collection}
                onChange={(event) =>
                  update('collection', event.currentTarget.value as ContentCollection)
                }
              />
              <SelectField
                label="Status"
                options={STATUS_OPTIONS}
                value={form().status}
                hint="Published items are the ones the public site builds."
                onChange={(event) => update('status', event.currentTarget.value as ContentStatus)}
              />
              <TextArea
                label="Body (markdown)"
                value={form().body}
                hint="Markdown is stored as written; the public site renders it at build time."
                onInput={(event) => update('body', event.currentTarget.value)}
              />

              <Show when={saveError()}>
                <div class="error-state" role="alert" style={{ 'margin-bottom': '16px' }}>
                  <span class="error-state__code">save_failed</span>
                  <p class="error-state__message">{saveError()}</p>
                </div>
              </Show>

              <div class="row row--between">
                <button type="submit" class="btn btn--primary" disabled={save.isPending}>
                  {save.isPending ? 'Saving...' : 'Save item'}
                </button>
                <span class="label" role="status">
                  {saved() ?? (touched() ? 'Unsaved changes' : '')}
                </span>
              </div>
            </div>
          </form>

          <section class="panel" aria-labelledby="content-preview-heading">
            <div class="panel__head">
              <h3 id="content-preview-heading">Preview</h3>
              <span class="label">Raw markdown</span>
            </div>
            <div class="panel__body">
              <Show
                when={form().body.trim()}
                fallback={
                  <EmptyState
                    bare
                    title="Nothing to preview"
                    body="The body is empty. Type markdown in the field above to see it here."
                  />
                }
              >
                <PreviewPane item={form()} />
              </Show>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function PreviewPane(props: { item: FormState }) {
  return (
    <div class="stack">
      <div class="row">
        <ContentStatusBadge status={props.item.status} />
        <span class="label">{props.item.collection}</span>
        <span class="label num">/{props.item.slug || 'untitled'}</span>
      </div>
      <div class="preview">
        <pre>{props.item.body}</pre>
      </div>
    </div>
  );
}

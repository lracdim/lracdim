import { For, Show, createSignal } from 'solid-js';
import { useMessages, useSendMessage } from '~/api/hooks/useMessages';
import { useProjects } from '~/api/hooks/useProjects';
import { QueryView } from '~/components/QueryView';
import { TextArea } from '~/components/fields';
import { session } from '~/lib/auth';
import { formatDateTime } from '~/lib/format';

export function ClientMessages() {
  const projects = useProjects();
  const [projectFilter, setProjectFilter] = createSignal<string>('all');
  const messages = useMessages(() => ({
    projectId: projectFilter() === 'all' ? undefined : projectFilter(),
  }));
  const send = useSendMessage();

  const [draft, setDraft] = createSignal('');
  const [touched, setTouched] = createSignal(false);
  const [sendError, setSendError] = createSignal<string | null>(null);

  const draftError = () =>
    touched() && !draft().trim() ? 'Write a message before sending.' : undefined;

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setTouched(true);
    const body = draft().trim();
    const clientId = session()?.clientId;
    if (!body || !clientId) return;
    setSendError(null);

    try {
      await send.mutateAsync({
        clientId,
        projectId: projectFilter() === 'all' ? undefined : projectFilter(),
        body,
      });
      setDraft('');
      setTouched(false);
    } catch (error) {
      const message =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'The message could not be sent.';
      setSendError(message);
    }
  }

  return (
    <>
      <div class="page-head">
        <div>
          <span class="label label--signal">Your account</span>
          <h1>Messages</h1>
          <p>
            One thread with the studio. Attach a message to a specific project, or leave
            it general.
          </p>
        </div>
      </div>

      <div class="filterbar">
        <label class="field field--inline">
          <span class="field__label">Project</span>
          <select
            class="field__control"
            value={projectFilter()}
            onChange={(event) => setProjectFilter(event.currentTarget.value)}
          >
            <option value="all">All messages</option>
            <For each={projects.data ?? []}>
              {(project) => <option value={project.id}>{project.name}</option>}
            </For>
          </select>
        </label>
      </div>

      <section class="panel" aria-labelledby="thread-heading">
        <div class="panel__head">
          <h2 id="thread-heading">Thread</h2>
          <span class="label" role="status">
            <Show when={!messages.isPending} fallback="Loading">
              {(messages.data ?? []).length} message
              {(messages.data ?? []).length === 1 ? '' : 's'}
            </Show>
          </span>
        </div>

        <div class="panel__body">
          <QueryView
            query={messages}
            loadingLabel="Loading messages"
            isEmpty={(rows) => rows.length === 0}
            emptyTitle="No messages yet"
            emptyBody="Write the first one below. The studio is notified by email."
          >
            {(rows) => (
              <ul class="thread">
                <For each={rows()}>
                  {(message) => (
                    <li
                      class="thread__item"
                      data-own={message.authorRole === 'client' ? 'true' : 'false'}
                    >
                      <div class="thread__meta">
                        <span class="thread__author">{message.authorName}</span>
                        <span class="label">
                          {message.authorRole === 'admin' ? 'Studio' : 'You'}
                        </span>
                        <span class="label num">{formatDateTime(message.sentAt)}</span>
                      </div>
                      <p class="thread__body">{message.body}</p>
                    </li>
                  )}
                </For>
              </ul>
            )}
          </QueryView>

          <form class="compose" onSubmit={handleSubmit} novalidate>
            <TextArea
              label="New message"
              required
              value={draft()}
              error={draftError()}
              placeholder="Ask a question, or send an update."
              hint={
                projectFilter() === 'all'
                  ? 'This message is not attached to a project.'
                  : 'Attached to the selected project.'
              }
              onInput={(event) => {
                setDraft(event.currentTarget.value);
                setTouched(true);
              }}
            />

            <Show when={sendError()}>
              <div class="error-state" role="alert" style={{ 'margin-bottom': '16px' }}>
                <span class="error-state__code">send_failed</span>
                <p class="error-state__message">{sendError()}</p>
              </div>
            </Show>

            <div class="compose__foot">
              <button type="submit" class="btn btn--primary" disabled={send.isPending}>
                {send.isPending ? 'Sending...' : 'Send message'}
              </button>
              <span class="label">
                {draft().trim().length} character{draft().trim().length === 1 ? '' : 's'}
              </span>
            </div>
          </form>
        </div>
      </section>
    </>
  );
}

import { For, createSignal } from 'solid-js';
import { useNavigate } from '@tanstack/solid-router';
import { MOCK_ACCOUNTS, signIn } from '~/lib/auth';

/**
 * TEMPORARY MOCK SIGN-IN.
 *
 * Pick a role and you are that role. There is no password, no verification and
 * no server involved.
 *
 * TODO(api): replace with the real session flow once the Litestar API exposes
 * POST /api/auth/login. The role must come back from the server in the session
 * response; this page must never decide it.
 */
export function Login() {
  const navigate = useNavigate();
  const [selected, setSelected] = createSignal(MOCK_ACCOUNTS[0].userId);

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const account = MOCK_ACCOUNTS.find((candidate) => candidate.userId === selected());
    if (!account) return;
    signIn(account);
    void navigate({ to: account.role === 'admin' ? '/admin' : '/client' });
  }

  return (
    <div class="login">
      <div class="login__card">
        <div class="login__head">
          <span class="label label--signal">Lracdimension</span>
          <h1>Studio dashboard</h1>
          <p>
            Admin pipeline and client portal for LRACDIMENSION. Sign in to continue.
          </p>
        </div>

        <div class="login__body">
          <div class="notice">
            <span class="notice__title">Temporary mock authentication</span>
            <p class="notice__body">
              There is no real sign-in yet. Choosing a role below stores a session in
              this browser only. Once the API is live this screen becomes a proper
              credential form and the role will be decided by the server.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <fieldset class="role-options">
              <legend>Sign in as</legend>
              <For each={MOCK_ACCOUNTS}>
                {(account) => (
                  <label class="role-option">
                    <input
                      type="radio"
                      name="account"
                      value={account.userId}
                      checked={selected() === account.userId}
                      onChange={() => setSelected(account.userId)}
                    />
                    <span>
                      <span class="role-option__name">{account.name}</span>
                      <span class="role-option__detail">
                        {account.role === 'admin'
                          ? 'Studio owner. Full pipeline, projects, clients and content.'
                          : `Client account. Sees only the records for ${account.clientId}.`}
                      </span>
                    </span>
                  </label>
                )}
              </For>
            </fieldset>

            <button type="submit" class="btn btn--primary btn--block">
              Sign in
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

import { Link } from '@tanstack/solid-router';
import { session } from '~/lib/auth';

export function NotFound() {
  const home = () => {
    const current = session();
    if (!current) return '/login' as const;
    return current.role === 'admin' ? ('/admin' as const) : ('/client' as const);
  };

  return (
    <div class="login">
      <div class="login__card">
        <div class="login__head">
          <span class="label label--signal">404</span>
          <h1>No such page</h1>
          <p>That address does not match anything in the dashboard.</p>
        </div>
        <div class="login__body">
          <Link to={home()} class="btn btn--primary btn--block">
            Back to the dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

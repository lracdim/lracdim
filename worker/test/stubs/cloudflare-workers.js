/** Stand-in for workerd's `cloudflare:workers` under node:test. */
export class WorkflowEntrypoint {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}

export class WorkerEntrypoint extends WorkflowEntrypoint {}

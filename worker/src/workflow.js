/**
 * The report-delivery Workflow (bound as REPORT_WORKFLOW in wrangler.jsonc).
 * Each step of deliverReport() runs as a durable Workflow step: retried with
 * backoff on its own, and resumed after the request that started it is gone.
 *
 * Kept apart from the pipeline itself so the pipeline can be tested under
 * node, where `cloudflare:workers` does not exist (test/setup.js stubs it).
 */
import { WorkflowEntrypoint } from 'cloudflare:workers';
import { deliverReport } from './report-delivery.js';

export class ReportDeliveryWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { requestId, apiOrigin = '' } = event.payload || {};
    if (!requestId) return { status: 'missing' };
    return deliverReport(this.env, requestId, step, { apiOrigin });
  }
}

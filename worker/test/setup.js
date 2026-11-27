/**
 * Loaded with `node --import` before any test: maps `cloudflare:workers`,
 * which only exists inside workerd, to a small stub so src/index.js (which
 * re-exports the Workflow class) imports under node.
 */
import { registerHooks } from 'node:module';

const stub = new URL('./stubs/cloudflare-workers.js', import.meta.url).href;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers') return { url: stub, shortCircuit: true };
    return next(specifier, context);
  }
});

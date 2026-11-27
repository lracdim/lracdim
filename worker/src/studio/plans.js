/**
 * The studio's care plans: price per month (USD), retainer hours included each
 * month, and what the plan covers (shown to clients on their billing page).
 * Copied from the Python engine (backend/engine/app/seed.py PLANS); this is
 * the studio's price list, not demo data. Edit it here, then deploy: a client's
 * MRR and included hours are copied from its plan whenever the plan is set.
 */
export const PLANS = {
  Essentials: { price: 390, includedHours: 2, features: ['Uptime & security monitoring', 'Daily backups', 'Monthly health report'] },
  Growth: { price: 890, includedHours: 6, features: ['Everything in Essentials', 'SEO & AEO optimisation', 'Analytics & leads reporting'] },
  Scale: { price: 1850, includedHours: 15, features: ['Everything in Growth', 'GEO / AI visibility programme', 'Conversion optimisation', 'Priority support'] }
};

export const PLAN_NAMES = Object.keys(PLANS);

export const planOut = (name) => (PLANS[name] ? { name, ...PLANS[name] } : { name: name || null, price: 0, includedHours: 0, features: [] });

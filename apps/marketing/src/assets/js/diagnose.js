/**
 * Bottleneck Finder (/diagnose/). Everything is scored in the browser.
 * Answers live in the URL hash (#i=<industry>&a=<one digit per question>) so a
 * result can be shared; "Send me a plan" hands it to the Hire me intake.
 */
import { esc } from './api.js';

const DRAFT_KEY = 'lracdim:start-draft'; // the intake modal restores this draft when it opens
const C = 2 * Math.PI * 52;

/** Pure: answers {id: 0|1|2} → ranked leaks and overall leakage. */
export function score(questions, answers) {
  const max = questions.reduce((s, q) => s + 2 * q.weight, 0);
  const leaks = questions
    .map((q) => ({ ...q, answer: answers[q.id], value: (answers[q.id] || 0) * q.weight }))
    .filter((l) => l.value > 0)
    .sort((a, b) => b.value - a.value || b.weight - a.weight);
  const total = leaks.reduce((s, l) => s + l.value, 0);
  const pct = max ? Math.round((total / max) * 100) : 0;
  const level = pct >= 55 ? 'high' : pct >= 25 ? 'moderate' : 'low';
  return { pct, level, leaks, answered: Object.keys(answers).filter((k) => answers[k] !== undefined).length };
}

const LEVEL = {
  low: { label: 'Low leakage', title: 'A tight operation, with a few edges to sharpen.', lede: 'Most of your work already runs on systems. Fix the leaks below and you are ahead of most businesses your size.' },
  moderate: { label: 'Moderate leakage', title: 'Your growth is leaking in a few specific places.', lede: 'These are the points where leads, time and cash slip away today. Fixing the first one usually pays for the rest.' },
  high: { label: 'High leakage', title: 'Your operation is working harder than it should.', lede: 'Too much of the business runs on memory, chat and retyping. The good news: these leaks are well understood, and the first fix is usually small.' }
};

export function initDiagnose() {
  const root = document.querySelector('[data-diagnose]');
  const data = JSON.parse(document.getElementById('dg-data').textContent);
  const { questions, industries } = data;
  const form = root.querySelector('[data-dg-form]');
  const q = (sel) => root.querySelector(sel);
  const ring = q('[data-dg-ring]');
  const arc = q('[data-dg-arc]');
  const result = q('[data-dg-result]');
  arc.style.strokeDasharray = `${C}`;
  arc.style.strokeDashoffset = `${C}`;

  const answers = {};
  let industry = '';

  const update = () => {
    const s = score(questions, answers);
    arc.style.strokeDashoffset = `${C * (1 - s.pct / 100)}`;
    ring.className = `dg__ring is-${s.answered ? s.level : 'low'}`;
    q('[data-dg-pct]').textContent = `${s.pct}%`;
    q('[data-dg-level]').textContent = s.answered ? LEVEL[s.level].label : 'Answer to begin';
    q('[data-dg-count]').textContent = String(s.answered);
    q('[data-dg-progress]').style.width = `${(s.answered / questions.length) * 100}%`;
    const done = s.answered === questions.length;
    q('[data-dg-go]').disabled = !done;
    q('[data-dg-hint]').textContent = done ? 'Ready. Your leaks are ranked by what they cost.' : `${questions.length - s.answered} to go.`;
    return s;
  };

  const writeHash = () => {
    const digits = questions.map((x) => (answers[x.id] === undefined ? '-' : answers[x.id])).join('');
    history.replaceState(null, '', `${location.pathname}${location.search}#${industry ? `i=${encodeURIComponent(industry)}&` : ''}a=${digits}`);
  };

  const render = () => {
    const s = update();
    const ind = industries.find((i) => i.slug === industry);
    const meta = LEVEL[s.level];
    q('[data-dg-sumline]').textContent = `${s.pct}% leakage · ${meta.label.toLowerCase()}${ind ? ` · ${ind.name}` : ''}`;
    q('[data-dg-title]').innerHTML = s.leaks.length ? `${esc(meta.title.replace(/\.$/, ''))}<span class="signal">.</span>` : 'No leaks reported<span class="signal">.</span>';
    q('[data-dg-lede]').textContent = s.leaks.length ? meta.lede : 'You answered no to every question. Either the operation is already systemised, or it is worth a second look with your team.';
    q('[data-dg-leaks]').innerHTML = s.leaks
      .slice(0, 6)
      .map(
        (l, i) => `<li class="rd-card dg__leak${i === 0 ? ' is-first' : ''}">
          <div class="dg__leak-head"><span class="rd-step__n">${String(i + 1).padStart(2, '0')}</span>${i === 0 ? '<span class="dg__flag">Fix this first</span>' : ''}<span class="dg__sev">${l.answer === 2 ? 'Yes' : 'Sometimes'} · ${'●'.repeat(l.weight)}${'○'.repeat(3 - l.weight)}</span></div>
          <h3 class="rd-t-h4">${esc(l.leak)}</h3>
          <p class="rd-t-body">${esc(l.cost)}</p>
          <p class="dg__fix"><b>The fix:</b> ${esc(l.fix)}</p>
          <a class="text-link" href="${esc(l.link.href)}">${esc(l.link.label)} ↗</a>
        </li>`
      )
      .join('');
    const indEl = q('[data-dg-industry]');
    if (ind) {
      indEl.hidden = false;
      indEl.innerHTML = `<div class="rd-card dg__ind">
        <div class="dg__ind-head"><p class="rd-t-upper">In ${esc(ind.name)}</p><h3 class="rd-t-h3">${esc(ind.tagline)}</h3></div>
        <div class="dg__ind-grid">
          <div><p class="rd-t-upper">Where it usually leaks</p><ul class="dg__ind-leaks">${ind.leaks.slice(0, 4).map((x) => `<li><b>${esc(x.title)}</b><span>${esc(x.detail)}</span></li>`).join('')}</ul></div>
          <div><p class="rd-t-upper">The first build</p><p class="rd-t-sub">${esc(ind.firstBuild)}</p>
            <table class="dg__metrics"><thead><tr><th scope="col">Measure</th><th scope="col">Typical</th><th scope="col">Built to reach</th></tr></thead><tbody>${ind.metrics.map((m) => `<tr><th scope="row">${esc(m.name)}</th><td>${esc(m.typical)}</td><td>${esc(m.target)}</td></tr>`).join('')}</tbody></table>
            <p class="rd-t-cap">Typical sector baselines and the targets systems like this are built to reach — not past results. <a href="/industries/${esc(ind.slug)}/">The full ${esc(ind.name)} blueprint ↗</a></p></div>
        </div>
      </div>`;
    } else {
      indEl.hidden = true;
      indEl.innerHTML = '';
    }
    result.hidden = false;
    return s;
  };

  form.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'industry') industry = t.value;
    else if (t.type === 'radio') {
      answers[t.name] = Number(t.value);
      t.closest('.dg__q')?.classList.add('is-answered');
    }
    update();
    writeHash();
    if (!result.hidden) render();
  });

  q('[data-dg-go]').addEventListener('click', () => {
    render();
    result.focus({ preventScroll: true });
    result.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });

  q('[data-dg-reset]').addEventListener('click', () => {
    form.reset();
    Object.keys(answers).forEach((k) => delete answers[k]);
    industry = '';
    root.querySelectorAll('.dg__q.is-answered').forEach((el) => el.classList.remove('is-answered'));
    result.hidden = true;
    history.replaceState(null, '', location.pathname);
    update();
    form.scrollIntoView({ block: 'start' });
  });

  q('[data-dg-copy]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      q('[data-dg-status]').textContent = 'Link copied. Anyone with it sees this result; nothing is stored on a server.';
    } catch {
      q('[data-dg-status]').textContent = `Copy this link: ${location.href}`;
    }
  });

  q('[data-dg-send]').addEventListener('click', () => {
    const s = score(questions, answers);
    const ind = industries.find((i) => i.slug === industry);
    const top = s.leaks.slice(0, 3);
    const message = [
      `Bottleneck Finder result${ind ? ` (${ind.name})` : ''}: ${s.pct}% leakage, ${LEVEL[s.level].label.toLowerCase()}.`,
      top.length ? `Top leaks: ${top.map((l, i) => `${i + 1}) ${l.leak}`).join('; ')}.` : 'No leaks reported.',
      `Result link: ${location.href}`
    ].join('\n');
    let draft = { step: 1, values: {} };
    try {
      draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null') || draft;
    } catch {
      /* ignore a corrupt draft */
    }
    draft.values = { ...draft.values, message, need: (top[0] && top[0].need) || 'Business System', current: top[0] ? top[0].cost : '', outcome: top[0] ? top[0].fix : '' };
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* private mode: the form opens without the prefill */
    }
    window.dispatchEvent(new Event('open-start'));
  });

  /* Restore from a shared link (#i=…&a=…) or a preset industry (?industry=…). */
  const hash = new URLSearchParams(location.hash.slice(1));
  const preset = hash.get('i') || new URLSearchParams(location.search).get('industry');
  if (preset && industries.some((i) => i.slug === preset)) {
    industry = preset;
    const el = form.querySelector(`input[name="industry"][value="${CSS.escape(preset)}"]`);
    if (el) el.checked = true;
  }
  const digits = hash.get('a') || '';
  questions.forEach((x, i) => {
    const d = digits[i];
    if (d === '0' || d === '1' || d === '2') {
      answers[x.id] = Number(d);
      const el = form.querySelector(`input[name="${x.id}"][value="${d}"]`);
      if (el) el.checked = true;
      el?.closest('.dg__q')?.classList.add('is-answered');
    }
  });
  const s = update();
  if (s.answered === questions.length) render();
}

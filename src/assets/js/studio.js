import { initDiagnosticModal } from './modal.js';
import { initStartForm } from './start.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const toggle = document.querySelector('[data-nav-toggle]');
const drawer = document.querySelector('[data-drawer]');
if (toggle && drawer) {
  drawer.inert = true;
  const setOpen = (open) => {
    drawer.inert = !open;
    drawer.classList.toggle('is-open', open);
    document.body.classList.toggle('is-locked', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('[data-nav-toggle-label]').textContent = open ? 'Close' : 'Menu';
    if (!open) toggle.focus();
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', e => {
    if (toggle.getAttribute('aria-expanded') !== 'true') return;
    if (e.key === 'Escape') setOpen(false);
    if (e.key === 'Tab') {
      const items = [toggle, ...drawer.querySelectorAll('a,button')];
      const index = items.indexOf(document.activeElement);
      if (e.shiftKey && index === 0) { e.preventDefault(); items.at(-1).focus(); }
      else if (!e.shiftKey && index === items.length - 1) { e.preventDefault(); toggle.focus(); }
    }
  });
  matchMedia('(min-width: 901px)').addEventListener('change', e => {
    if(e.matches && toggle.getAttribute('aria-expanded') === 'true') setOpen(false);
  });
}

// Content stays visible without scripts. Animate only elements entering view.
const entering = new IntersectionObserver(entries => entries.forEach(entry => {
  if (!entry.isIntersecting) return;
  if (!reduced.matches) entry.target.classList.add('is-entering');
  entering.unobserve(entry.target);
}), { threshold: .08 });
document.querySelectorAll('[data-enter]').forEach(el => entering.observe(el));
// Preserve visibility of legacy service and process elements.
document.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('is-in'));

const steps = [...document.querySelectorAll('[data-pipeline]')];
const descriptions = [
  'The Researcher stage gathers context for the article and passes it to the writing stage.',
  'The Writer stage turns the research into an article draft for the next stage of the pipeline.',
  'The SEO Generator prepares search-oriented content before the article reaches WordPress.',
  'The WordPress publisher receives the prepared content. The connected workflow brings these four stages together.'
];
let timer;
const play = document.querySelector('[data-play-pipeline]');
const selectStep = index => {
  steps.forEach((button,i) => button.setAttribute('aria-pressed',String(i === index)));
  document.querySelector('[data-pipeline-description]').textContent = descriptions[index];
};
const stop = () => { clearInterval(timer); timer = null; if(play) play.textContent = 'Play walkthrough ↗'; };
steps.forEach((button,index) => button.addEventListener('click', () => {stop(); selectStep(index);}));
play?.addEventListener('click', () => {
  if(timer) {stop(); return;}
  let index=0; selectStep(index); play.textContent='Stop walkthrough';
  timer=setInterval(() => {if(++index === steps.length){stop();return;} selectStep(index);},2400);
});
document.addEventListener('visibilitychange', () => {if(document.hidden) stop();});
reduced.addEventListener('change', stop);
document.querySelectorAll('[data-print]').forEach(button => {button.hidden=false;button.addEventListener('click',()=>window.print());});
initDiagnosticModal();
initStartForm();
window.addEventListener('pagehide',()=>{stop();entering.disconnect();},{once:true});

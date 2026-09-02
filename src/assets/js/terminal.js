/**
 * Interactive console — vanilla port of the React <Terminal /> component.
 * Adds command history (arrow keys) and a few extra commands.
 */

const BANNER = [
  ['system', 'LRACDIMENSION terminal v4.0.0'],
  ['system', 'Type "help" for available commands'],
  ['output', ''],
  ['output', '> System initialized successfully'],
  ['output', '> Ready for input_']
];

const COMMANDS = {
  help: () => [
    'Available commands:',
    '  about      - Who is behind this system',
    '  skills     - Technical capability list',
    '  projects   - Recent builds',
    '  ops        - Operational history',
    '  diagnostic - Open the website diagnostic protocol',
    '  contact    - Contact information',
    '  clear      - Clear the console'
  ],
  about: () => [
    'John Carl Dimatulac',
    'Web Developer & Automation Engineer',
    '8+ years building scalable web systems',
    'Location: Laguna, Philippines 4025'
  ],
  skills: () => [
    'Frontend:   React.js, Vue.js, Next.js, Tailwind CSS',
    'Backend:    PHP, Node.js, MySQL, REST APIs',
    'Automation: n8n, Webhooks, AI agent integration',
    'Tools:      WordPress, JetEngine, Eleventy'
  ],
  projects: () => [
    '1. Custom HR Management System',
    '2. AI-Driven Business Automation',
    '3. E-Learning Ecosystem',
    '4. Automated Agent Platform'
  ],
  ops: () => [
    'Spade Security Services  — Web Dev / Systems & AI Lead   (2025 → now)',
    'Elimate Web Automation   — Founder / Web Strategist      (2025 → now)',
    'AgentGenius.ai           — Automation Engineer           (2024 → 2025)',
    'Pistevo Incorporated     — Network Administrator         (2017 → 2018)'
  ],
  contact: () => [
    'Email:    john@spadesecurityservices.com',
    'Intake:   /start/  (written reply within one business day)'
  ]
};

export function initTerminal() {
  const root = document.querySelector('[data-terminal]');
  if (!root) return;

  const screen = root.querySelector('[data-terminal-screen]');
  const form = root.querySelector('[data-terminal-form]');
  const input = root.querySelector('[data-terminal-input]');

  const history = [];
  let historyIndex = -1;

  function write(type, text) {
    const line = document.createElement('div');
    line.className = `terminal__line terminal__line--${type}`;
    line.textContent = text;
    screen.appendChild(line);
    screen.scrollTop = screen.scrollHeight;
  }

  function reset() {
    screen.innerHTML = '';
    BANNER.forEach(([type, text]) => write(type, text));
  }

  reset();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = input.value.trim();
    if (!raw) return;

    history.push(raw);
    historyIndex = history.length;
    write('input', `> ${raw}`);

    const cmd = raw.toLowerCase();

    if (cmd === 'clear') {
      reset();
      input.value = '';
      return;
    }

    if (cmd === 'diagnostic') {
      write('output', 'Opening System Diagnostic Protocol v1.0 ...');
      window.dispatchEvent(new CustomEvent('open-diagnostic'));
    } else if (COMMANDS[cmd]) {
      COMMANDS[cmd]().forEach((line) => write('output', line));
    } else {
      write('error', `Command not found: ${raw}`);
      write('hint', 'Type "help" for available commands');
    }

    write('output', '');
    write('output', '> Ready for input_');
    input.value = '';
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex > 0) input.value = history[--historyIndex];
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex < history.length - 1) input.value = history[++historyIndex];
      else {
        historyIndex = history.length;
        input.value = '';
      }
    }
  });
}

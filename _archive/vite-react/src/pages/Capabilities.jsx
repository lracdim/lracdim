const Icon = ({ name }) => (
  <span className="material-symbols-outlined">{name}</span>
)

const Capabilities = () => (
  <main className="pt-32 pb-24 px-6 lg:px-12 max-w-7xl mx-auto">
    <header className="mb-20">
      <span className="font-label text-[0.6875rem] uppercase tracking-[0.2em] text-primary mb-4 block">Translation Layer</span>
      <h1 className="font-headline text-5xl md:text-7xl font-black tracking-tighter mb-6 uppercase leading-none">
        Capabilities
      </h1>
      <p className="max-w-2xl text-on-surface-variant text-lg font-light leading-relaxed">
        Not just tech lists. Here's what I can actually do for you—translated into real business value, not raw technology names.
      </p>
    </header>

    <section className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-32">
      <div className="md:col-span-7 glass-panel p-8 border border-outline-variant/10 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
          <Icon name="hub" />
        </div>
        <h3 className="font-headline text-2xl font-bold uppercase tracking-tight mb-8 flex items-center gap-3">
          <Icon name="settings_input_component" />
          Website System Development
        </h3>
        <div className="space-y-6">
          <p className="text-on-surface-variant text-sm font-light leading-relaxed mb-4">End-to-end system architecture, HR Management Systems (HRMS), Learning Management Systems (LMS), and custom web portals.</p>
          <div className="flex flex-wrap gap-2">
            {['System Architecture', 'HRMS', 'LMS', 'Custom Portals'].map(tag => (
              <span key={tag} className="px-3 py-1 bg-surface-container-highest text-[10px] font-label uppercase tracking-wider text-on-surface-variant border border-outline-variant/20">{tag}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="md:col-span-5 glass-panel p-8 border border-outline-variant/10 group">
        <h3 className="font-headline text-2xl font-bold uppercase tracking-tight mb-8 flex items-center gap-3">
          <Icon name="database" />
          Backend &amp; Database
        </h3>
        <div className="space-y-8">
          {[
            { icon: 'code', title: 'PHP', desc: 'Core backend logic and custom application development.' },
            { icon: 'storage', title: 'MySQL', desc: 'Relational database design and query optimization.' },
            { icon: 'api', title: 'REST API', desc: 'Third-party service integrations and data synchronization.' }
          ].map((item, idx) => (
            <div key={idx} className="flex items-start gap-4">
              <div className="p-2 bg-surface-container-highest">
                <Icon name={item.icon} />
              </div>
              <div>
                <h4 className="font-headline text-sm font-bold uppercase tracking-tight">{item.title}</h4>
                <p className="text-xs text-on-surface-variant mt-1">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="md:col-span-5 glass-panel p-8 border border-outline-variant/10">
        <h3 className="font-headline text-2xl font-bold uppercase tracking-tight mb-8 flex items-center gap-3">
          <Icon name="smart_toy" />
          Automation &amp; AI
        </h3>
        <div className="grid grid-cols-1 gap-4">
          {[
            { label: 'WORKFLOWS', title: 'n8n Workflows' },
            { label: 'CONNECTIVITY', title: 'Webhooks Integration' },
            { label: 'INTELLIGENCE', title: 'AI Agent Integration' }
          ].map((item, idx) => (
            <div key={idx} className="p-4 bg-surface-container-highest/50 border border-outline-variant/10">
              <span className="font-label text-[10px] text-primary block mb-1">{item.label}</span>
              <div className="font-headline font-bold text-sm">{item.title}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="md:col-span-7 glass-panel p-8 border border-outline-variant/10 relative overflow-hidden group">
        <h3 className="font-headline text-2xl font-bold uppercase tracking-tight mb-8 flex items-center gap-3">
          <Icon name="layers" />
          Frontend &amp; CMS Tools
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h4 className="font-label text-[10px] uppercase tracking-widest text-primary mb-4">Frameworks &amp; Libraries</h4>
            <ul className="space-y-2">
              <li className="flex items-center gap-3"><Icon name="check_circle" /><span className="font-label text-xs uppercase tracking-widest">React.js / Next.js / Vue.js</span></li>
              <li className="flex items-center gap-3"><Icon name="check_circle" /><span className="font-label text-xs uppercase tracking-widest">Tailwind CSS / JS / SSG</span></li>
            </ul>
          </div>
          <div>
            <h4 className="font-label text-[10px] uppercase tracking-widest text-primary mb-4">CMS &amp; Design</h4>
            <ul className="space-y-2">
              <li className="flex items-center gap-3"><Icon name="check_circle" /><span className="font-label text-xs uppercase tracking-widest">WordPress / JetEngine</span></li>
              <li className="flex items-center gap-3"><Icon name="check_circle" /><span className="font-label text-xs uppercase tracking-widest">Canva / Visual UI/UX</span></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-outline-variant/10">
          <div className="flex items-center justify-between">
            <span className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">Platform Scalability</span>
            <span className="font-mono text-primary text-sm">ENTERPRISE_GRADE</span>
          </div>
        </div>
      </div>
    </section>

    <section className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20">
      <div className="glass-panel p-8 border border-outline-variant/10">
        <h3 className="font-headline text-xl font-bold uppercase tracking-tight mb-6 flex items-center gap-3">
          <Icon name="analytics" />
          Real-Time Tracking Systems
        </h3>
        <p className="text-on-surface-variant text-sm leading-relaxed mb-6">
          Build systems that monitor, track, and report in real-time. From inventory management to user behavior analytics.
        </p>
        <div className="flex flex-wrap gap-2">
          {['Live Dashboards', 'Real-Time Metrics', 'Instant Notifications'].map(tag => (
            <span key={tag} className="px-3 py-1 bg-surface-container-highest text-[10px] font-label uppercase tracking-wider text-primary">{tag}</span>
          ))}
        </div>
      </div>

      <div className="glass-panel p-8 border border-outline-variant/10">
        <h3 className="font-headline text-xl font-bold uppercase tracking-tight mb-6 flex items-center gap-3">
          <Icon name="schedule" />
          Scheduling Engines
        </h3>
        <p className="text-on-surface-variant text-sm leading-relaxed mb-6">
          Automated scheduling systems that handle appointments, tasks, and resource allocation without manual intervention.
        </p>
        <div className="flex flex-wrap gap-2">
          {['Cron Jobs', 'Task Queues', 'Appointment Booking'].map(tag => (
            <span key={tag} className="px-3 py-1 bg-surface-container-highest text-[10px] font-label uppercase tracking-wider text-primary">{tag}</span>
          ))}
        </div>
      </div>

      <div className="glass-panel p-8 border border-outline-variant/10">
        <h3 className="font-headline text-xl font-bold uppercase tracking-tight mb-6 flex items-center gap-3">
          <Icon name="api" />
          API Integrations
        </h3>
        <p className="text-on-surface-variant text-sm leading-relaxed mb-6">
          Connect your systems with third-party services. Payment gateways, CRMs, email providers, and custom APIs.
        </p>
        <div className="flex flex-wrap gap-2">
          {['Payment Processing', 'CRM Sync', 'Webhook Events'].map(tag => (
            <span key={tag} className="px-3 py-1 bg-surface-container-highest text-[10px] font-label uppercase tracking-wider text-primary">{tag}</span>
          ))}
        </div>
      </div>

      <div className="glass-panel p-8 border border-outline-variant/10">
        <h3 className="font-headline text-xl font-bold uppercase tracking-tight mb-6 flex items-center gap-3">
          <Icon name="dashboard" />
          Dashboard Architecture
        </h3>
        <p className="text-on-surface-variant text-sm leading-relaxed mb-6">
          Design and build intuitive dashboards that turn complex data into actionable insights.
        </p>
        <div className="flex flex-wrap gap-2">
          {['Data Visualization', 'Custom Widgets', 'Role-Based Views'].map(tag => (
            <span key={tag} className="px-3 py-1 bg-surface-container-highest text-[10px] font-label uppercase tracking-wider text-primary">{tag}</span>
          ))}
        </div>
      </div>
    </section>
  </main>
)

export default Capabilities

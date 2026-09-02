const Icon = ({ name }) => (
  <span className="material-symbols-outlined">{name}</span>
)

const ExecutionLogs = () => (
  <main className="pt-32 pb-20 px-6 lg:px-12 max-w-7xl mx-auto">
    <header className="mb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <span className="font-label text-[0.6875rem] uppercase tracking-[0.2em] text-primary mb-4 block">Proof Layer</span>
          <h1 className="font-headline text-5xl md:text-7xl font-bold tracking-tighter text-on-surface">Execution Logs</h1>
        </div>
        <div className="glass-panel p-4 border border-outline-variant/20 flex gap-6">
          <div>
            <span className="font-label text-[0.5rem] uppercase text-on-surface-variant block mb-1">Status</span>
            <span className="font-headline text-primary font-bold text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              ACTIVE_SYSTEM
            </span>
          </div>
          <div className="w-px h-8 bg-outline-variant/20"></div>
          <div>
            <span className="font-label text-[0.5rem] uppercase text-on-surface-variant block mb-1">Total_Runtimes</span>
            <span className="font-headline text-on-surface font-bold text-sm">1,248_HRS</span>
          </div>
        </div>
      </div>
      <p className="mt-8 text-on-surface-variant max-w-2xl text-lg leading-relaxed">
        Real problems, what I built, why I built it that way, and the results. This is my proof layer that shows I can execute and explain decisions.
      </p>
    </header>

    <div className="space-y-32">
      {[
        {
          date: '2024.03.14_14:32:01',
          title: 'LOG_ENTRY_01: Distributed_Sync',
          arch: 'Event-Driven Mesh',
          perf: '+42% Throughput',
          tags: ['KUBERNETES', 'GO_V1.22', 'GRPC'],
          img: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800',
          context: 'Client needed real-time sync across 5 regional offices handling 10k+ concurrent users.',
          problem: 'Legacy monolithic synchronization led to significant race conditions in peak load scenarios. Database locking overhead consumed 30% of total CPU cycles during horizontal scaling.',
          approach: 'Implemented event-driven architecture with immutable infrastructure layer. Custom Go-based sync engine with sub-millisecond latency.',
          outcomes: [
            { label: 'Automation_Win', value: 'Zero-Touch Recovery Protocol' },
            { label: 'Architectural_Shift', value: 'Immutable Infrastructure Layer' },
            { label: 'Metric', value: '99.999% Reliability' }
          ]
        },
        {
          date: '2023.11.02_09:15:44',
          title: 'LOG_ENTRY_02: CI_CD_Hardening',
          arch: 'Security-First Pipeline',
          perf: '-65% Deploy Duration',
          tags: ['GITHUB_ACTIONS', 'TERRAFORM', 'SCA'],
          img: 'https://images.unsplash.com/photo-1518432031352-d6fc5c10da5a?w=800',
          context: 'Enterprise client required 100% security compliance before any deployment to production.',
          problem: 'Re-engineered the deployment pipeline to prioritize ephemeral environments. Every feature branch spawns a dynamic, short-lived cluster for integration testing.',
          approach: 'Security-first pipeline with automated CVE scanning, SCA tools, and ephemeral environments. Terraform for infrastructure as code.',
          outcomes: [
            { label: 'Security', value: 'Automated CVE Scanning' },
            { label: 'Performance', value: '15k req/s Sustained' },
            { label: 'Deploy_Time', value: '04:22s Average' }
          ]
        }
      ].map((log, idx) => (
        <section key={idx} className="relative">
          <div className="flex flex-col lg:flex-row gap-12">
            <div className="lg:w-1/4 space-y-6">
              <div className="sticky top-24">
                <div className="font-label text-[0.6875rem] text-primary/60 mb-2 font-mono">{log.date}</div>
                <div className="font-headline text-2xl font-bold text-on-surface border-l-2 border-primary pl-4">{log.title}</div>
                <div className="mt-6 space-y-4">
                  <div>
                    <span className="font-label text-[0.5rem] uppercase text-on-surface-variant block mb-1">Architecture</span>
                    <span className="text-xs font-mono text-on-surface">{log.arch}</span>
                  </div>
                  <div>
                    <span className="font-label text-[0.5rem] uppercase text-on-surface-variant block mb-1">Performance_Gain</span>
                    <span className="text-xs font-mono text-primary">{log.perf}</span>
                  </div>
                  <div className="pt-4">
                    <div className="flex flex-wrap gap-2">
                      {log.tags.map((tag, tIdx) => (
                        <span key={tIdx} className="px-2 py-1 bg-surface-container-highest text-[10px] font-mono text-on-surface-variant border border-outline-variant/10">{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="lg:w-3/4 space-y-12">
              <div className="aspect-video bg-surface-container-low relative overflow-hidden group">
                <img alt="Server Infrastructure" className="w-full h-full object-cover opacity-40 mix-blend-luminosity grayscale" src={log.img} />
                <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent"></div>
                <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end">
                  <div className="glass-panel p-4 border border-outline-variant/30 max-w-sm">
                    <h3 className="font-headline text-sm font-bold text-primary mb-2 flex items-center gap-2">
                      <Icon name="account_tree" />
                      SYSTEM_TOPOLOGY
                    </h3>
                    <p className="text-[10px] font-mono text-on-surface-variant leading-tight">
                      Sub-millisecond synchronization across regional clusters using custom implementation.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <h4 className="font-headline text-xs font-black uppercase tracking-widest text-on-surface-variant">Context</h4>
                  <p className="text-sm leading-relaxed text-on-surface-variant">{log.context}</p>
                </div>
                <div className="space-y-4">
                  <h4 className="font-headline text-xs font-black uppercase tracking-widest text-on-surface-variant">Problem</h4>
                  <p className="text-sm leading-relaxed text-on-surface-variant">{log.problem}</p>
                </div>
                <div className="space-y-4">
                  <h4 className="font-headline text-xs font-black uppercase tracking-widest text-on-surface-variant">Approach</h4>
                  <p className="text-sm leading-relaxed text-on-surface-variant">{log.approach}</p>
                </div>
              </div>

              <div className="bg-surface-container-high p-6 font-mono text-[11px] leading-relaxed text-primary/80 terminal-scroll overflow-y-auto max-h-[150px]">
                <span className="text-on-surface-variant opacity-50">// Execution Optimization</span><br/>
                func <span className="text-primary">ApplyClusterSync</span>(ctx context.Context) {'{'}...{'}'}<br/>
                &nbsp;&nbsp;select {'{'}...{'}'}<br/>
                &nbsp;&nbsp;case {'<-'}state.Heartbeat:<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;log.Info(<span className="text-secondary">"CLUSTER_STATE_OK"</span>)<br/>
                &nbsp;&nbsp;{'}'}<br/>
                {'}'}
              </div>

              <div className="border-t border-outline-variant/10 pt-8 flex flex-wrap gap-12">
                {log.outcomes.map((outcome, oIdx) => (
                  <div key={oIdx}>
                    <span className="text-[10px] font-mono text-on-surface-variant block uppercase mb-2">{outcome.label}</span>
                    <p className="text-sm font-bold text-primary">{outcome.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>

    <section className="mt-40 pt-20 border-t border-outline-variant/10">
      <div className="max-w-3xl">
        <span className="font-label text-[0.6875rem] uppercase tracking-[0.2em] text-primary/60 mb-6 block">Continue_Investigation</span>
        <h2 className="font-headline text-4xl font-bold text-on-surface mb-8 tracking-tight">Need a robust architecture for your next high-load system?</h2>
        <div className="flex flex-wrap gap-4">
          <button className="btn-gradient text-on-primary px-8 py-4 font-headline font-bold uppercase tracking-wider text-sm hover:translate-y-[-2px] transition-transform">
            Initiate_Dialogue
          </button>
          <button className="bg-surface-container border border-outline-variant/30 text-on-surface px-8 py-4 font-headline font-bold uppercase tracking-wider text-sm hover:bg-surface-variant transition-colors">
            View_Capabilities
          </button>
        </div>
      </div>
    </section>
  </main>
)

export default ExecutionLogs

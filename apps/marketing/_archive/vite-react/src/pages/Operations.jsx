const Icon = ({ name }) => (
  <span className="material-symbols-outlined">{name}</span>
)

const Operations = () => (
  <main className="pt-32 pb-24 px-6 lg:px-12 max-w-7xl mx-auto">
    <header className="mb-20">
      <span className="font-label text-[0.6875rem] uppercase tracking-[0.2em] text-primary mb-4 block">Credibility Layer</span>
      <h1 className="font-headline text-5xl md:text-7xl font-black tracking-tighter mb-6 uppercase leading-none">
        Operations
      </h1>
      <p className="max-w-2xl text-on-surface-variant text-lg font-light leading-relaxed">
        Roles, what I actually did, scope of responsibility, and impact. This validates I've operated in real environments, not just built side projects.
      </p>
    </header>

    <section className="mb-32">
      <div className="mb-16">
        <span className="font-label text-[0.6875rem] uppercase tracking-[0.2em] text-primary mb-4 block">Professional Journey</span>
        <h2 className="font-headline text-4xl font-black tracking-tight uppercase">History <span className="text-on-surface-variant/30">&amp;</span> Achievements</h2>
      </div>
      <div className="space-y-0 relative">
        <div className="absolute left-0 md:left-1/2 top-0 bottom-0 w-px bg-outline-variant/20 hidden md:block"></div>
        
        {[
          { 
            date: 'JUNE 2025 — PRESENT', 
            title: 'Web Developer, System Solutions & AI Lead', 
            company: 'Spade Security Services (Rocklin, CA)',
            role: 'Technical Lead',
            points: [
              'Redeveloped and upgraded the company website to enhance system functionality and user interface',
              'Architected and implemented backend system improvements using PHP and MySQL',
              'Designed custom web solutions to support specific operational requirements'
            ],
            impact: '40% improvement in system performance',
            align: 'left' 
          },
          { 
            date: 'JANUARY 2025 — PRESENT', 
            title: 'Founder / Web Strategist', 
            company: 'Elimate Web Automation',
            role: 'Founder',
            points: [
              'Founded a venture focused on transforming standard websites into AI-powered automated platforms',
              'Develop intelligent automation tools tailored to client needs using advanced system integrations',
              'Provide direct customer support, ongoing technical maintenance, and troubleshooting for AI-integrated applications'
            ],
            impact: 'Serving 8+ enterprise clients',
            align: 'right' 
          },
          { 
            date: 'NOVEMBER 2024 — JULY 2025', 
            title: 'Automation Engineer', 
            company: 'AgentGenius.ai (Toronto, Canada)',
            role: 'Senior Engineer',
            points: [
              'Developed and deployed AI-powered web applications and integrated automation tools into existing enterprise systems',
              'Optimized web performance and user experience using data-driven AI insights'
            ],
            impact: 'Reduced operational costs by 70%',
            align: 'left' 
          },
          { 
            date: 'APRIL 2017 — MARCH 2018', 
            title: 'Network Administrator', 
            company: 'Pistevo Incorporated',
            role: 'IT Specialist',
            points: [
              'Maintained agent computer systems to ensure zero downtime during operating hours',
              'Created the company ESL website, Pistevo Learn, using WordPress'
            ],
            impact: 'Zero downtime achieved',
            align: 'right' 
          }
        ].map((exp, idx) => (
          <div key={idx} className="relative grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-24 pb-24 group">
            <div className={exp.align === 'right' ? 'md:order-2' : 'md:text-right'}>
              <span className="font-label text-[10px] text-primary mb-2 block tracking-widest">{exp.date}</span>
              <span className="inline-block px-2 py-1 bg-primary/10 text-primary text-[10px] font-label uppercase tracking-widest mb-2">{exp.role}</span>
              <h3 className="font-headline text-2xl font-bold uppercase tracking-tight text-on-surface">{exp.title}</h3>
              <p className="text-primary font-bold font-headline text-sm tracking-widest uppercase">{exp.company}</p>
              <div className="mt-4 glass-panel p-4 border border-primary/20">
                <span className="font-label text-[10px] text-on-surface-variant uppercase">Impact</span>
                <p className="text-sm text-primary font-bold mt-1">{exp.impact}</p>
              </div>
            </div>
            <div className={exp.align === 'right' ? 'md:text-right relative' : 'relative'}>
              <div className={`absolute ${exp.align === 'right' ? '-right-[49px]' : '-left-[49px]'} top-1.5 w-2 h-2 bg-outline-variant hidden md:block group-hover:bg-primary transition-colors`}></div>
              <ul className={`space-y-4 text-on-surface-variant font-light leading-relaxed max-w-lg ${exp.align === 'right' ? 'md:text-right' : ''}`}>
                {exp.points.map((point, pIdx) => (
                  <li key={pIdx} className={`flex gap-4 ${exp.align === 'right' ? 'justify-end' : ''}`}>
                    {exp.align === 'right' ? <><span className="text-primary mt-1">/</span><span>{point}</span></> : <><span className="text-primary mt-1">/</span><span>{point}</span></>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </section>

    <section className="glass-panel p-12 border border-outline-variant/10 mb-20">
      <h2 className="font-headline text-3xl font-bold uppercase tracking-tight mb-8 text-center">Process Optimization Workflow</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {[
          { step: '01', title: 'Analysis', desc: 'Identify bottlenecks and opportunities' },
          { step: '02', title: 'Design', desc: 'Architect custom solutions' },
          { step: '03', title: 'Implement', desc: 'Build and integrate systems' },
          { step: '04', title: 'Optimize', desc: 'Monitor and improve performance' }
        ].map((phase, idx) => (
          <div key={idx} className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-surface-container-highest flex items-center justify-center font-headline text-2xl font-black text-primary">{phase.step}</div>
            <h3 className="font-headline text-lg font-bold uppercase mb-2">{phase.title}</h3>
            <p className="text-sm text-on-surface-variant">{phase.desc}</p>
          </div>
        ))}
      </div>
    </section>

    <section className="py-16 border-t border-outline-variant/10">
      <div className="flex flex-wrap justify-between items-center gap-12 opacity-30 grayscale">
        {['SPADE_SEC', 'ELIM8_WEB', 'AGENT_GENIUS', 'PISTEVO_INC', 'AUTO_STRAT'].map((brand) => (
          <div key={brand} className="font-headline font-black text-2xl tracking-tighter">{brand}</div>
        ))}
      </div>
    </section>
  </main>
)

export default Operations

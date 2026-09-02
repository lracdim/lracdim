const Icon = ({ name }) => (
  <span className="material-symbols-outlined">{name}</span>
)

const Builds = () => (
  <main className="pt-32 pb-20 px-6 lg:px-12 max-w-7xl mx-auto">
    <header className="mb-20">
      <span className="font-label text-[0.6875rem] uppercase tracking-[0.2em] text-primary mb-4 block">Output Layer</span>
      <h1 className="font-headline text-5xl md:text-7xl font-bold tracking-tighter uppercase leading-none">
        Builds
      </h1>
      <p className="mt-6 max-w-2xl text-on-surface-variant text-lg leading-relaxed">
        Actual systems and applications that exist because of me. Live demos, screenshots, and short descriptions. This is what I&apos;ve created.
      </p>
    </header>

    <section className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-32">
      {[
        { 
          title: 'Custom HR Management System', 
          desc: 'End-to-end system architecture with automated payroll and employee tracking modules. Built for enterprise scalability.', 
          tech: ['PHP', 'MySQL', 'React.js'],
          img: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800',
          category: 'Enterprise System'
        },
        { 
          title: 'AI-Driven Business Automation', 
          desc: 'Complex n8n workflow integrations reducing manual operational tasks by 70%. Custom AI agent pipelines for data processing.', 
          tech: ['n8n', 'Webhooks', 'Vue.js'],
          img: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800',
          category: 'Automation'
        },
        { 
          title: 'E-Learning Ecosystem', 
          desc: 'Advanced Learning Management System (LMS) with personalized student progress tracking and automated assessments.', 
          tech: ['WordPress', 'JetEngine', 'PHP'],
          img: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800',
          category: 'EdTech'
        },
        { 
          title: 'Automated Agent Platform', 
          desc: 'Web-based automation tool utilizing AI insights for real-time performance optimization and reporting.', 
          tech: ['Node.js', 'n8n', 'Next.js'],
          img: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800',
          category: 'AI Platform'
        }
      ].map((project, idx) => (
        <div key={idx} className="group relative space-y-6">
          <div className="aspect-[16/10] bg-surface-container overflow-hidden rounded-sm relative">
            <img alt={project.title} className="w-full h-full object-cover grayscale group-hover:grayscale-0 group-hover:scale-105 transition-all duration-700" src={project.img} />
            <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
            <div className="absolute top-4 left-4">
              <span className="px-3 py-1 bg-surface/80 backdrop-blur-sm text-[10px] font-label uppercase tracking-widest text-primary">
                {project.category}
              </span>
            </div>
          </div>
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-headline text-2xl font-bold mb-2 tracking-tight group-hover:text-primary transition-colors">{project.title}</h3>
              <p className="text-on-surface-variant text-sm max-w-sm">{project.desc}</p>
            </div>
            <Icon name="arrow_outward" />
          </div>
          <div className="flex gap-4 font-label text-[10px] text-on-surface-variant uppercase tracking-widest">
            {project.tech.map((t, i) => <span key={i}>{t}{i < project.tech.length - 1 && '/'}</span>)}
          </div>
        </div>
      ))}
    </section>

    <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {[
        { icon: 'deployed_code', title: 'Live Systems', count: '12+', desc: 'Production deployments' },
        { icon: 'cloud_done', title: 'Uptime Average', count: '99.9%', desc: 'Across all platforms' },
        { icon: 'speed', title: 'Performance Score', count: 'A+', desc: 'Lighthouse ratings' }
      ].map((stat, idx) => (
        <div key={idx} className="glass-panel p-8 border border-outline-variant/10 text-center">
          <Icon name={stat.icon} />
          <div className="font-headline text-4xl font-black text-primary mt-4 mb-2">{stat.count}</div>
          <div className="font-headline text-sm font-bold uppercase tracking-tight">{stat.title}</div>
          <div className="text-xs text-on-surface-variant mt-1">{stat.desc}</div>
        </div>
      ))}
    </section>
  </main>
)

export default Builds

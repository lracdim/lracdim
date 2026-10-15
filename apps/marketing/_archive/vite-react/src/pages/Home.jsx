import { useNavigate } from 'react-router-dom'
import Terminal from '../components/Terminal'

const Icon = ({ name }) => (
  <span className="material-symbols-outlined">{name}</span>
)

const Home = () => {
  const navigate = useNavigate()
  return (
    <main>
      <section className="relative min-h-screen flex flex-col justify-center px-6 lg:px-12 pt-16 overflow-hidden">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-primary/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-tertiary/10 blur-[100px] rounded-full"></div>
        
        <div className="max-w-5xl mx-auto w-full text-center">
          <div className="mb-6">
            <span className="font-label text-xs uppercase tracking-[0.2em] text-primary">- Located in Laguna Philippines 4025 -</span>
          </div>
          
          <h1 className="font-headline text-4xl md:text-5xl lg:text-6xl font-normal tracking-tighter leading-[1] text-on-background mb-6">
            I Build Systems<br/>That Run <span className="bg-gradient-to-r from-primary to-tertiary bg-clip-text text-transparent">Operations</span>
          </h1>
          
          <p className="max-w-2xl mx-auto text-on-surface-variant text-base md:text-lg leading-relaxed mb-4">
            Web developer and automation engineer focused on real-time systems, scheduling engines, and scalable web infrastructure.
          </p>
          
          <p className="max-w-2xl mx-auto text-on-surface-variant/70 text-sm md:text-base leading-relaxed mb-10">
            From concept to deployment—designed for execution, not just presentation.
          </p>
          
          <div className="flex flex-wrap justify-center gap-4">
            <button onClick={() => navigate('/builds')} className="bg-gradient-to-r from-primary to-tertiary text-on-primary px-6 py-3 font-headline text-xs font-normal uppercase tracking-widest rounded hover:translate-y-[-2px] transition-transform shadow-lg shadow-primary/20">
              View Builds
            </button>
            <button onClick={() => navigate('/logs')} className="border border-outline-variant/30 text-on-background px-6 py-3 font-headline text-xs font-normal uppercase tracking-widest rounded hover:bg-surface-container transition-colors">
              Execution Logs
            </button>
          </div>
        </div>
      </section>

      <section className="py-24 px-6 lg:px-12 bg-background">
        <div className="max-w-7xl mx-auto">
          <div className="mb-12">
            <span className="font-label text-[10px] uppercase tracking-[0.3em] text-primary mb-4 block">Portfolio</span>
            <h2 className="font-headline text-3xl md:text-4xl font-normal tracking-tight">Selected Builds</h2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {[
              { 
                title: 'Custom HR Management System', 
                desc: 'End-to-end HR platform with automated payroll processing and employee tracking.', 
                tech: ['PHP', 'MySQL', 'React.js'],
                img: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800'
              },
              { 
                title: 'AI-Driven Business Automation', 
                desc: 'Integrated n8n workflows reducing manual operations by over 70%.', 
                tech: ['n8n', 'Webhooks', 'Vue.js'],
                img: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800'
              },
              { 
                title: 'E-Learning Ecosystem', 
                desc: 'Learning platform with structured modules and real-time progress tracking.', 
                tech: ['WordPress', 'JetEngine', 'PHP'],
                img: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800'
              }
            ].map((project, idx) => (
              <div key={idx} className="group space-y-3">
                <div className="aspect-[16/10] bg-surface-container overflow-hidden rounded relative">
                  <img alt={project.title} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" src={project.img} />
                </div>
                <h3 className="font-headline text-xl font-normal tracking-tight group-hover:text-primary transition-colors">{project.title}</h3>
                <p className="text-on-surface-variant text-sm">{project.desc}</p>
                <div className="flex gap-4 font-label text-[10px] text-on-surface-variant uppercase tracking-widest">
                  {project.tech.map((t, i) => <span key={i}>{t}{i < project.tech.length - 1 && ' / '}</span>)}
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-12 flex justify-center">
            <button onClick={() => navigate('/builds')} className="font-headline text-xs font-normal uppercase tracking-widest text-primary flex items-center gap-2 hover:gap-4 transition-all">
              View All Builds
              <Icon name="arrow_forward" />
            </button>
          </div>
        </div>
      </section>

      <section className="py-24 px-6 lg:px-12 bg-surface-container-low">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <span className="font-label text-[10px] uppercase tracking-[0.3em] text-primary mb-4 block">What I Do</span>
            <h2 className="font-headline text-3xl md:text-4xl font-normal tracking-tight mb-6">
              I don&apos;t just build websites—<br/>I design systems that handle operations.
            </h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {[
              'Real-time tracking and monitoring systems',
              'Workflow automation using APIs and event-driven logic',
              'Dashboard and control panel architecture',
              'Custom platforms for internal business operations'
            ].map((item, idx) => (
              <div key={idx} className="bg-surface-container/80 backdrop-blur border border-outline-variant/20 p-4 flex items-start gap-3">
                <div className="w-2 h-2 bg-primary rounded-full mt-1.5 flex-shrink-0"></div>
                <p className="text-on-surface-variant text-sm">{item}</p>
              </div>
            ))}
          </div>
          
          <button onClick={() => navigate('/capabilities')} className="font-headline text-xs font-normal uppercase tracking-widest text-primary flex items-center gap-2 hover:gap-4 transition-all">
            View Capabilities
            <Icon name="arrow_forward" />
          </button>
        </div>
      </section>

      <section className="py-24 px-6 lg:px-12 bg-background">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-headline text-3xl md:text-5xl font-normal tracking-tighter leading-tight mb-6">
            Start a System That Actually Runs Your Operations
          </h2>
          <p className="text-on-surface-variant text-base mb-8 max-w-2xl mx-auto">
            If your workflows are manual, fragmented, or inefficient—those are system problems. I design and build solutions that eliminate them.
          </p>
          <button className="bg-gradient-to-r from-primary to-tertiary text-on-primary px-8 py-4 font-headline text-xs font-normal uppercase tracking-widest rounded hover:scale-105 transition-transform duration-300">
            Start a Project
          </button>
        </div>
      </section>

      <section className="py-24 px-6 lg:px-12 bg-surface-container-low">
        <div className="max-w-4xl mx-auto">
          <div className="mb-12">
            <span className="font-label text-[0.6875rem] uppercase tracking-[0.2em] text-primary mb-4 block">Interactive Console</span>
            <h2 className="font-headline text-4xl font-normal tracking-tight uppercase">Terminal</h2>
          </div>
          <Terminal />
          <div className="mt-8 pt-8 border-t border-outline-variant/10">
            <button onClick={() => navigate('/admin')} className="text-on-surface-variant text-sm font-label hover:text-primary transition-colors">
              /admin
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

export default Home

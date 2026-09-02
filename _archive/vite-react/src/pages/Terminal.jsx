import { useState } from 'react'

const Icon = ({ name }) => (
  <span className="material-symbols-outlined">{name}</span>
)

const posts = [
  {
    id: 1,
    title: 'Why I Think in Systems Before I Build',
    date: '2024.11.15',
    category: 'Architecture',
    excerpt: 'Most developers jump straight to code. I spend weeks understanding the system first. Here\'s why that changed everything for me.',
    readTime: 5,
    image: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800',
    content: `The biggest mistake I see developers make is treating every project like it's unique. They reinvent the wheel because "this time it's different."

But here's what 8 years of building taught me: most problems are the same problem, just wearing different clothes.

When I approach a new project, I don't ask "what should I build?" I ask "what system am I joining?"

Every business is a system of inputs, processes, and outputs. Your job isn't to build something new—it's to find where the system breaks and fix it.

This shift in thinking changed how I deliver value. Instead of "look at this cool feature," I say "here's how this eliminates a bottleneck."

The result? Clients don't see me as a developer. They see me as someone who understands their business and can translate it into working software.

That's the difference between coding and creating systems.`
  },
  {
    id: 2,
    title: 'The Pipeline Portfolio Structure',
    date: '2024.11.08',
    category: 'Strategy',
    excerpt: 'Your portfolio isn\'t a collection of projects. It\'s a communication pipeline. Here\'s how to structure it so clients can\'t ignore you.',
    readTime: 7,
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800',
    content: `I used to have a portfolio that looked like everyone else's. Project 1, Project 2, Project 3. Skills list. Contact form.

It got me nowhere.

Then I realized: clients don't care about what you built. They care about what you can do for them. And more importantly, they care about whether you understand them.

The pipeline structure changed how I present myself:

**Terminal** (Thinking Layer)
Raw ideas, breakdowns of systems, lessons from execution. This shows I don't just execute—I think.

**Execution Logs** (Proof Layer)
Context → Problem → Approach → Outcome. Real problems, real solutions, real results.

**Builds** (Output Layer)
What exists because of me. Screenshots, demos, short descriptions. No essays.

**Capabilities** (Translation Layer)
Not "React, Node, PostgreSQL." Instead: "Real-time tracking systems, scheduling engines, API integrations."

**Operations** (Credibility Layer)
What I actually did, scope of responsibility, impact. Not job titles—proof of execution.

This pipeline tells a story. And stories convert.`
  },
  {
    id: 3,
    title: 'On Automation: Don\'t Automate Chaos',
    date: '2024.10.28',
    category: 'Automation',
    excerpt: 'Before you automate a workflow, make sure the workflow makes sense. Automating a broken process just breaks faster.',
    readTime: 4,
    image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800',
    content: `I got burned on my first major automation project.

Client wanted to automate their entire onboarding flow. 12 steps, 4 different systems, dozens of manual touchpoints.

I built the n8n workflows. Connected everything. Shipped it.

A month later, they called. "The automation is fast, but now the errors are faster."

They had automated a broken process. And broken processes automated just scale the chaos.

Now my automation workflow:

1. Map the current process (before any automation)
2. Question every step ("why does this exist?")
3. Simplify the process first
4. Only then automate

The best automation isn't the one that runs fastest. It's the one that eliminates the most friction while introducing the least new complexity.`
  },
  {
    id: 4,
    title: 'Context Over Tools',
    date: '2024.10.15',
    category: 'Development',
    excerpt: 'Stop asking "what framework should I use?" Start asking "what problem am I solving?" Tools are means, not ends.',
    readTime: 3,
    image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800',
    content: `I used to be a framework hopper.

"Oh, React is hot? Learn React. Vue is trending? Pick up Vue. Next.js is the future? Migrate everything."

I spent more time learning tools than solving problems.

Then I worked on a project that needed serious performance optimization. The team was fighting over React vs Vue while the real issue was architectural.

We switched focus: What does this system actually need?

Real-time updates? WebSockets, not polling.
Heavy data processing? Backend workers, not frontend loops.
Complex state? Single source of truth, not prop drilling.

The tool became obvious once the context was clear.

Now when I evaluate a project, I ask:
- What are the constraints?
- What does success look like?
- What's the simplest thing that could work?

Frameworks come last, not first.`
  },
  {
    id: 5,
    title: 'On Client Communication: Explain the Why',
    date: '2024.09.30',
    category: 'Communication',
    excerpt: 'Technical decisions mean nothing to clients. Business outcomes mean everything. Learn to translate.',
    readTime: 6,
    image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800',
    content: `I used to explain technical decisions to clients.

"We're using a microservices architecture because it allows for independent scaling and service isolation."

Client nods. Looks confused. Agrees because I sound confident.

Three months later: "Why does this cost so much? We just need a simple website."

The problem: I explained the what and how, not the why.

Now I translate everything:

Instead of: "We're implementing a caching layer."
I say: "Your site will load in under 2 seconds instead of 8. That means users stay instead of bouncing. We estimate 30% more conversions."

Instead of: "We'll use webhooks for real-time sync."
I say: "Your inventory updates everywhere instantly. No more overselling. No more angry customers."

Clients don't care about your architecture. They care about their results.

Learn to translate. It's half the job.`
  }
]

const TerminalSingle = ({ post, onBack }) => (
  <main className="pt-32 pb-20 px-6 lg:px-12 max-w-3xl mx-auto">
    <button onClick={onBack} className="mb-8 text-primary font-headline text-sm uppercase tracking-widest flex items-center gap-2 hover:gap-4 transition-all">
      <Icon name="arrow_back" />
      Back to Terminal
    </button>

    <article>
      {post.image && (
        <div className="aspect-[16/9] bg-surface-container overflow-hidden rounded mb-12">
          <img alt={post.title} className="w-full h-full object-cover" src={post.image} />
        </div>
      )}

      <div className="flex items-center gap-4 mb-6">
        <span className="font-mono text-sm text-on-surface-variant">{post.date}</span>
        <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-label uppercase tracking-wider">{post.category}</span>
        <span className="text-sm text-on-surface-variant">{post.readTime} min read</span>
      </div>

      <h1 className="font-headline text-4xl md:text-5xl font-normal tracking-tight mb-8">{post.title}</h1>

      <div className="space-y-6">
        {post.content.split('\n\n').map((paragraph, idx) => (
          <p key={idx} className="text-on-surface-variant text-lg leading-relaxed">{paragraph}</p>
        ))}
      </div>
    </article>
  </main>
)

const Terminal = () => {
  const [selectedPost, setSelectedPost] = useState(null)

  if (selectedPost) {
    return <TerminalSingle post={selectedPost} onBack={() => setSelectedPost(null)} />
  }

  return (
    <main className="pt-32 pb-20 px-6 lg:px-12 max-w-4xl mx-auto">
      <header className="mb-16">
        <span className="font-label text-[10px] uppercase tracking-[0.2em] text-primary mb-4 block">Thinking Layer</span>
        <h1 className="font-headline text-4xl md:text-5xl font-normal tracking-tight uppercase">Terminal</h1>
        <p className="mt-4 text-on-surface-variant text-base max-w-xl">
          Raw ideas, breakdowns of systems I&apos;m building, lessons from execution, and opinions—not generic tutorials.
        </p>
      </header>

      <div className="space-y-12">
        {posts.map((post) => (
          <article 
            key={post.id}
            onClick={() => setSelectedPost(post)}
            className="group cursor-pointer"
          >
            <div className="aspect-[16/9] bg-surface-container overflow-hidden rounded mb-6">
              <img 
                alt={post.title} 
                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" 
                src={post.image} 
              />
            </div>
            
            <div className="flex items-center gap-4 mb-3">
              <span className="font-mono text-[10px] text-on-surface-variant">{post.date}</span>
              <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-label uppercase tracking-wider">{post.category}</span>
              <span className="text-[10px] text-on-surface-variant">{post.readTime} min read</span>
            </div>
            
            <h2 className="font-headline text-2xl font-normal mb-3 group-hover:text-primary transition-colors">{post.title}</h2>
            <p className="text-on-surface-variant text-sm leading-relaxed mb-4">{post.excerpt}</p>
            
            <button className="text-primary font-headline text-sm uppercase tracking-widest flex items-center gap-2 hover:gap-4 transition-all">
              Read More
              <Icon name="arrow_forward" />
            </button>
          </article>
        ))}
      </div>
    </main>
  )
}

export default Terminal

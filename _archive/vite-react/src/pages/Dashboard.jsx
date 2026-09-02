import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const Icon = ({ name }) => (
  <span className="material-symbols-outlined">{name}</span>
)

export const LoginPage = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const _0x = {
    a: String.fromCharCode(67, 97, 114, 108),
    b: String.fromCharCode(80, 111, 103, 105),
    c: String.fromCharCode(49, 50, 51, 52, 53, 54, 55, 56, 57, 113, 119, 101, 114, 116, 121, 117, 105, 111, 112)
  }

  const _auth = () => {
    const u = _0x.a
    const p = _0x.b + _0x.c
    return { u, p }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    await new Promise(resolve => setTimeout(resolve, 800))

    const { u, p } = _auth()
    
    if (username === u && password === p) {
      localStorage.setItem('admin_logged_in', 'true')
      window.location.href = '/admin'
    } else {
      setError('Invalid credentials')
      setIsLoading(false)
    }
  }

  return (
    <main className="pt-32 pb-20 px-6 lg:px-12 max-w-md mx-auto">
      <div className="text-center mb-12">
        <Icon name="admin_panel_settings" />
        <h1 className="font-headline text-3xl font-normal tracking-tight uppercase mt-4">Admin Access</h1>
        <p className="text-on-surface-variant mt-2 text-sm">Enter your credentials to continue</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-surface-container border border-outline-variant/20 p-4 text-on-surface font-headline rounded"
            placeholder="Enter username"
            autoComplete="off"
          />
        </div>

        <div>
          <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-surface-container border border-outline-variant/20 p-4 text-on-surface font-headline rounded"
            placeholder="Enter password"
            autoComplete="off"
          />
        </div>

        {error && (
          <div className="bg-error/10 border border-error/30 p-4 rounded">
            <p className="text-error text-sm font-headline">{error}</p>
          </div>
        )}

        <button 
          type="submit" 
          disabled={isLoading}
          className="w-full bg-gradient-to-r from-primary to-tertiary text-on-primary px-8 py-4 font-headline text-sm font-normal uppercase tracking-widest rounded hover:scale-[1.02] transition-transform disabled:opacity-50"
        >
          {isLoading ? 'Verifying...' : 'Login'}
        </button>
      </form>

      <div className="mt-8 text-center">
        <button onClick={() => window.location.href = '/'} className="text-on-surface-variant text-sm hover:text-primary transition-colors">
          ← Back to site
        </button>
      </div>
    </main>
  )
}

const ContentEditor = () => {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('terminal')
  const [terminalForm, setTerminalForm] = useState({ 
    title: '', 
    category: 'Architecture', 
    excerpt: '', 
    content: '',
    image: ''
  })
  const [logsForm, setLogsForm] = useState({ 
    title: '', 
    architecture: '', 
    performance: '', 
    context: '', 
    problem: '', 
    approach: '',
    image: '',
    tags: ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    alert(`${activeTab === 'terminal' ? 'Terminal' : 'Execution Log'} submitted! (CMS integration needed)`)
  }

  return (
    <main className="pt-32 pb-20 px-6 lg:px-12 max-w-5xl mx-auto">
      <header className="mb-12 flex items-center justify-between">
        <div>
          <h1 className="font-headline text-4xl font-normal tracking-tight uppercase">Dashboard</h1>
          <p className="text-on-surface-variant mt-2">Create and manage your content</p>
        </div>
        <button onClick={() => { localStorage.removeItem('admin_logged_in'); navigate('/') }} className="text-on-surface-variant text-sm hover:text-primary">
          Logout
        </button>
      </header>

      <div className="flex gap-4 mb-8 border-b border-outline-variant/20">
        <button
          onClick={() => setActiveTab('terminal')}
          className={`pb-4 px-4 font-headline text-sm uppercase tracking-widest transition-colors ${
            activeTab === 'terminal' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          Terminal (Blog)
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`pb-4 px-4 font-headline text-sm uppercase tracking-widest transition-colors ${
            activeTab === 'logs' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          Execution Logs
        </button>
      </div>

      {activeTab === 'terminal' ? (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Image URL</label>
            <input
              type="url"
              value={terminalForm.image}
              onChange={(e) => setTerminalForm({...terminalForm, image: e.target.value})}
              className="w-full bg-surface-container border border-outline-variant/20 p-4 text-on-surface font-mono text-sm rounded"
              placeholder="https://images.unsplash.com/..."
            />
          </div>

          <div>
            <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Title</label>
            <input
              type="text"
              value={terminalForm.title}
              onChange={(e) => setTerminalForm({...terminalForm, title: e.target.value})}
              className="w-full bg-surface-container border border-outline-variant/20 p-4 text-on-surface font-headline rounded"
              placeholder="Why I Think in Systems Before I Build"
            />
          </div>

          <div>
            <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Category</label>
            <select
              value={terminalForm.category}
              onChange={(e) => setTerminalForm({...terminalForm, category: e.target.value})}
              className="w-full bg-surface-container border border-outline-variant/20 p-4 text-on-surface font-headline rounded"
            >
              <option>Architecture</option>
              <option>Strategy</option>
              <option>Automation</option>
              <option>Development</option>
              <option>Communication</option>
            </select>
          </div>

          <div>
            <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Excerpt</label>
            <textarea
              value={terminalForm.excerpt}
              onChange={(e) => setTerminalForm({...terminalForm, excerpt: e.target.value})}
              className="w-full bg-surface-container border border-outline-variant/20 p-4 text-on-surface font-headline rounded h-24"
              placeholder="Brief summary of the post..."
            />
          </div>

          <div>
            <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Content</label>
            <textarea
              value={terminalForm.content}
              onChange={(e) => setTerminalForm({...terminalForm, content: e.target.value})}
              className="w-full bg-surface-container border border-outline-variant/20 p-4 text-on-surface font-mono rounded h-64"
              placeholder="Write your content here..."
            />
          </div>

          <button type="submit" className="bg-gradient-to-r from-primary to-tertiary text-on-primary px-8 py-4 font-headline text-sm font-normal uppercase tracking-widest rounded hover:scale-105 transition-transform">
            Publish to Terminal
          </button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Image URL</label>
            <input
              type="url"
              value={logsForm.image}
              onChange={(e) => setLogsForm({...logsForm, image: e.target.value})}
              className="w-full bg-surface-container border border-outline-variant/20 p-4 text-on-surface font-mono text-sm rounded"
              placeholder="https://images.unsplash.com/..."
            />
          </div>

          <div>
            <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Title</label>
            <input
              type="text"
              value={logsForm.title}
              onChange={(e) => setLogsForm({...logsForm, title: e.target.value})}
              className="w-full bg-surface-container border border-outline-variant/20 p-4 text-on-surface font-headline rounded"
              placeholder="LOG_ENTRY_01: Distributed_Sync"
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Architecture</label>
              <input
                type="text"
                value={logsForm.architecture}
                onChange={(e) => setLogsForm({...logsForm, architecture: e.target.value})}
                className="w-full bg-surface-container border border-outline-variant/20 p-4 text-on-surface font-headline rounded"
                placeholder="Event-Driven Mesh"
              />
            </div>
            <div>
              <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Performance Gain</label>
              <input
                type="text"
                value={logsForm.performance}
                onChange={(e) => setLogsForm({...logsForm, performance: e.target.value})}
                className="w-full bg-surface-container border border-outline-variant/20 p-4 text-on-surface font-headline rounded"
                placeholder="+42% Throughput"
              />
            </div>
          </div>

          <div>
            <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Tags (comma separated)</label>
            <input
              type="text"
              value={logsForm.tags}
              onChange={(e) => setLogsForm({...logsForm, tags: e.target.value})}
              className="w-full bg-surface-container border border-outline-variant/20 p-4 text-on-surface font-mono text-sm rounded"
              placeholder="KUBERNETES, GO_V1.22, GRPC"
            />
          </div>

          <div>
            <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Context</label>
            <textarea
              value={logsForm.context}
              onChange={(e) => setLogsForm({...logsForm, context: e.target.value})}
              className="w-full bg-surface-container border border-outline-variant/20 p-4 text-on-surface font-headline rounded h-24"
              placeholder="What was the situation?"
            />
          </div>

          <div>
            <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Problem</label>
            <textarea
              value={logsForm.problem}
              onChange={(e) => setLogsForm({...logsForm, problem: e.target.value})}
              className="w-full bg-surface-container border border-outline-variant/20 p-4 text-on-surface font-headline rounded h-24"
              placeholder="What challenge needed to be solved?"
            />
          </div>

          <div>
            <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Approach</label>
            <textarea
              value={logsForm.approach}
              onChange={(e) => setLogsForm({...logsForm, approach: e.target.value})}
              className="w-full bg-surface-container border border-outline-variant/20 p-4 text-on-surface font-headline rounded h-24"
              placeholder="How did you solve it?"
            />
          </div>

          <button type="submit" className="bg-gradient-to-r from-primary to-tertiary text-on-primary px-8 py-4 font-headline text-sm font-normal uppercase tracking-widest rounded hover:scale-105 transition-transform">
            Publish to Execution Logs
          </button>
        </form>
      )}
    </main>
  )
}

const Dashboard = () => {
  const isLoggedIn = localStorage.getItem('admin_logged_in') === 'true'

  if (!isLoggedIn) {
    return <LoginPage />
  }

  return <ContentEditor />
}

export default Dashboard

import { useState } from 'react'

const Icon = ({ name }) => (
  <span className="material-symbols-outlined">{name}</span>
)

const Terminal = () => {
  const [command, setCommand] = useState('')
  const [output, setOutput] = useState([
    { type: 'system', text: 'J.C._DIMATULAC Terminal v4.0.0' },
    { type: 'system', text: 'Type "help" for available commands' },
    { type: 'system', text: '' },
    { type: 'output', text: '> System initialized successfully' },
    { type: 'output', text: '> Ready for input_' }
  ])

  const handleCommand = (e) => {
    e.preventDefault()
    if (!command.trim()) return

    const newOutput = [...output, { type: 'input', text: `> ${command}` }]
    
    if (command.toLowerCase() === 'help') {
      newOutput.push({ type: 'output', text: 'Available commands:' })
      newOutput.push({ type: 'output', text: '  about     - Display information about the developer' })
      newOutput.push({ type: 'output', text: '  skills    - List technical skills' })
      newOutput.push({ type: 'output', text: '  projects  - View recent projects' })
      newOutput.push({ type: 'output', text: '  contact   - Contact information' })
      newOutput.push({ type: 'output', text: '  clear     - Clear terminal' })
    } else if (command.toLowerCase() === 'about') {
      newOutput.push({ type: 'output', text: 'John Carl Dimatulac' })
      newOutput.push({ type: 'output', text: 'Web Developer & Automation Engineer' })
      newOutput.push({ type: 'output', text: '8+ years of experience building scalable web systems' })
      newOutput.push({ type: 'output', text: 'Location: Cabuyao, Philippines' })
    } else if (command.toLowerCase() === 'skills') {
      newOutput.push({ type: 'output', text: 'Frontend: React.js, Vue.js, Next.js, Tailwind CSS' })
      newOutput.push({ type: 'output', text: 'Backend: PHP, Node.js, MySQL, REST APIs' })
      newOutput.push({ type: 'output', text: 'Automation: n8n, Webhooks, AI Agent Integration' })
      newOutput.push({ type: 'output', text: 'Tools: WordPress, JetEngine, Canva' })
    } else if (command.toLowerCase() === 'projects') {
      newOutput.push({ type: 'output', text: '1. Custom HR Management System' })
      newOutput.push({ type: 'output', text: '2. AI-Driven Business Automation' })
      newOutput.push({ type: 'output', text: '3. E-Learning Ecosystem' })
      newOutput.push({ type: 'output', text: '4. Automated Agent Platform' })
    } else if (command.toLowerCase() === 'contact') {
      newOutput.push({ type: 'output', text: 'Email: contact@example.com' })
      newOutput.push({ type: 'output', text: 'GitHub: github.com/jcdimatulac' })
      newOutput.push({ type: 'output', text: 'LinkedIn: linkedin.com/in/jcdimatulac' })
    } else if (command.toLowerCase() === 'clear') {
      setOutput([{ type: 'system', text: 'Terminal cleared' }])
      setCommand('')
      return
    } else {
      newOutput.push({ type: 'error', text: `Command not found: ${command}` })
      newOutput.push({ type: 'hint', text: 'Type "help" for available commands' })
    }
    
    newOutput.push({ type: 'output', text: '' })
    newOutput.push({ type: 'output', text: '> Ready for input_' })
    setOutput(newOutput)
    setCommand('')
  }

  return (
    <div className="glass-panel border border-outline-variant/20 rounded-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-surface-container-highest border-b border-outline-variant/20">
        <div className="w-3 h-3 rounded-full bg-error"></div>
        <div className="w-3 h-3 rounded-full bg-tertiary"></div>
        <div className="w-3 h-3 rounded-full bg-primary"></div>
        <span className="ml-4 font-mono text-[10px] text-on-surface-variant">jcdimatulac@terminal:~</span>
      </div>
      <div className="p-6 h-[300px] overflow-y-auto font-mono text-sm">
        {output.map((line, idx) => (
          <div key={idx} className={`mb-1 ${line.type === 'system' ? 'text-primary' : line.type === 'error' ? 'text-error' : line.type === 'hint' ? 'text-on-surface-variant' : 'text-on-surface'}`}>
            {line.text}
          </div>
        ))}
      </div>
      <form onSubmit={handleCommand} className="flex items-center gap-2 px-6 py-4 bg-surface-container-highest border-t border-outline-variant/20">
        <span className="text-primary font-mono">&gt;</span>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          className="flex-1 bg-transparent outline-none font-mono text-sm text-on-surface placeholder-on-surface-variant/50"
          placeholder="Enter command..."
          autoFocus
        />
      </form>
    </div>
  )
}

export default Terminal

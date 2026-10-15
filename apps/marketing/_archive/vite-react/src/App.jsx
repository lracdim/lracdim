import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import './App.css'

import Home from './pages/Home'
import Terminal from './pages/Terminal'
import ExecutionLogs from './pages/ExecutionLogs'
import Builds from './pages/Builds'
import Capabilities from './pages/Capabilities'
import Operations from './pages/Operations'
import Dashboard, { LoginPage } from './pages/Dashboard'
import LoadingScreen from './components/LoadingScreen'

const Icon = ({ name }) => (
  <span className="material-symbols-outlined">{name}</span>
)

const Navbar = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const navItems = [
    { id: 'builds', label: 'Builds' },
    { id: 'capabilities', label: 'Capabilities' },
    { id: 'operations', label: 'Operations' },
    { id: 'logs', label: 'Execution Logs' },
    { id: 'terminal', label: 'Terminal' }
  ]

  return (
    <nav className="fixed top-0 w-full z-50 bg-[#060e20]/60 backdrop-blur-xl border-b border-[#40485d]/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]">
      <div className="flex justify-between items-center px-6 py-3 max-w-screen-2xl mx-auto">
        <div className="text-sm font-light tracking-widest text-[#81ecff] font-headline uppercase cursor-pointer" onClick={() => navigate('/')}>
          J.C._DIMATULAC
        </div>
        <div className="hidden md:flex items-center gap-8">
          {navItems.map((item) => (
            <a
              key={item.id}
              className={`font-headline text-xs uppercase tracking-widest font-normal cursor-pointer transition-colors ${
                location.pathname === '/' + item.id || (item.id === 'builds' && location.pathname === '/')
                  ? 'text-[#81ecff] border-b-2 border-[#81ecff] pb-1'
                  : 'text-[#dee5ff]/70 hover:text-[#81ecff]'
              }`}
              onClick={() => navigate('/' + item.id)}
            >
              {item.label}
            </a>
          ))}
        </div>
        <button className="bg-gradient-to-r from-primary to-tertiary text-on-primary px-4 py-1.5 font-headline text-xs font-normal uppercase tracking-widest rounded hover:scale-105 transition-transform">
          [ Start Project ]
        </button>
      </div>
    </nav>
  )
}

const MobileNavbar = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const navItems = [
    { id: 'builds', label: 'Builds', icon: 'deployed_code' },
    { id: 'capabilities', label: 'Caps', icon: 'psychology' },
    { id: 'operations', label: 'Ops', icon: 'manufacturing' },
    { id: 'logs', label: 'Logs', icon: 'description' },
    { id: 'terminal', label: 'Term', icon: 'code_blocks' }
  ]

  return (
    <nav className="fixed bottom-0 left-0 w-full flex justify-around items-center px-4 pb-4 pt-2 bg-[#091328]/80 backdrop-blur-lg border-t border-[#40485d]/30 shadow-[0_-4px_20px_rgba(0,229,255,0.05)] z-50 md:hidden">
      {navItems.map((item) => (
        <a
          key={item.id}
          className={`flex flex-col items-center justify-center cursor-pointer active:translate-y-0.5 transition-transform ${
            location.pathname === '/' + item.id || (item.id === 'builds' && location.pathname === '/')
              ? 'text-[#81ecff] bg-[#192540]/60 rounded-sm px-3 py-1'
              : 'text-[#dee5ff]/50 hover:text-[#81ecff]'
          }`}
          onClick={() => navigate('/' + item.id)}
        >
          <Icon name={item.icon} />
          <span className="font-label text-[10px] font-normal uppercase tracking-widest mt-1">{item.label}</span>
        </a>
      ))}
    </nav>
  )
}

const Footer = () => (
  <footer className="bg-[#060e20] w-full py-8 px-8 border-t border-[#40485d]/10">
    <div className="bg-gradient-to-r from-transparent via-[#40485d]/20 to-transparent h-[1px] mb-6"></div>
    <div className="flex flex-col md:flex-row justify-between items-center gap-6 max-w-screen-2xl mx-auto">
      <div className="text-center md:text-left">
        <p className="font-headline text-sm font-light tracking-widest text-[#dee5ff] mb-1 uppercase">J.C DIMATULAC</p>
        <p className="font-label text-[10px] tracking-widest uppercase opacity-60 text-[#dee5ff]">System Builder / Automation Engineer</p>
      </div>
      <div className="flex gap-6">
        <a className="font-label text-[10px] tracking-widest uppercase opacity-60 text-[#dee5ff] hover:text-[#81ecff] hover:underline underline-offset-4 transition-opacity duration-300" href="#">GitHub</a>
        <a className="font-label text-[10px] tracking-widest uppercase opacity-60 text-[#dee5ff] hover:text-[#81ecff] hover:underline underline-offset-4 transition-opacity duration-300" href="#">LinkedIn</a>
        <a className="font-label text-[10px] tracking-widest uppercase opacity-60 text-[#dee5ff] hover:text-[#81ecff] hover:underline underline-offset-4 transition-opacity duration-300" href="#">Source Code</a>
      </div>
    </div>
    <div className="max-w-screen-2xl mx-auto mt-6 pt-6 border-t border-[#40485d]/10">
      <p className="font-label text-[10px] tracking-widest uppercase opacity-40 text-[#dee5ff] text-center">
        © 2026 J.C Dimatulac
      </p>
    </div>
  </footer>
)

function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  )
}

function AppInner() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!isLoading) {
      window.scrollTo(0, 0)
    }
  }, [isLoading])

  if (isLoading) {
    return <LoadingScreen onComplete={() => setIsLoading(false)} />
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/builds" element={<Builds />} />
        <Route path="/capabilities" element={<Capabilities />} />
        <Route path="/operations" element={<Operations />} />
        <Route path="/logs" element={<ExecutionLogs />} />
        <Route path="/terminal" element={<Terminal />} />
        <Route path="/admin" element={<Dashboard />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
      <Footer />
      <MobileNavbar />
    </div>
  )
}

export default App

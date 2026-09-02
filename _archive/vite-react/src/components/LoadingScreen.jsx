import { useState, useEffect } from 'react'

const lines = [
  { text: 'INITIALIZING SYSTEMS...', delay: 300, opacity: 60 },
  { text: 'LOADING FRONTEND + BACKEND...', delay: 700, opacity: 70 },
  { text: 'CONNECTING AUTOMATION LAYERS...', delay: 1100, opacity: 80 },
  { text: 'STATUS: OPERATIONAL', delay: 1500, opacity: 100, type: 'success' }
]

const LoadingScreen = ({ onComplete }) => {
  const [progress, setProgress] = useState(0)
  const [currentLine, setCurrentLine] = useState(0)
  const [showCursor, setShowCursor] = useState(true)

  useEffect(() => {
    const cursorInterval = setInterval(() => {
      setShowCursor(prev => !prev)
    }, 300)

    return () => clearInterval(cursorInterval)
  }, [])

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval)
          return 100
        }
        return prev + 1
      })
    }, 30)

    return () => clearInterval(progressInterval)
  }, [])

  useEffect(() => {
    const lineTimers = lines.map((line, index) => {
      return setTimeout(() => {
        setCurrentLine(index + 1)
      }, line.delay)
    })

    const completeTimer = setTimeout(() => {
      onComplete()
    }, 2000)

    return () => {
      lineTimers.forEach(timer => clearTimeout(timer))
      clearTimeout(completeTimer)
    }
  }, [onComplete])

  return (
    <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center">
      <div className="max-w-xl w-full px-8">
        <div className="mb-12 text-center">
          <h1 className="font-headline text-3xl font-black tracking-tighter text-[#81ecff] uppercase mb-2">
            J.C DIMATULAC
          </h1>
          <p className="font-label text-[10px] tracking-widest uppercase opacity-50 text-[#dee5ff]">
            System Builder / Automation Engineer
          </p>
        </div>

        <div className="glass-panel p-8 border border-outline-variant/20 mb-8">
          <div className="font-mono text-sm space-y-3">
            {lines.map((line, index) => (
              <p 
                key={index}
                className={`transition-opacity duration-500 ${
                  currentLine > index ? 'opacity-100' : 'opacity-30'
                } ${
                  line.type === 'success' ? 'text-secondary font-bold' : 'text-primary'
                }`}
              >
                &gt; {line.text}
              </p>
            ))}
            {currentLine < lines.length && (
              <p className="text-primary">
                &gt; <span className={showCursor ? 'opacity-100' : 'opacity-0'}>_</span>
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between font-label text-[10px] uppercase tracking-widest">
            <span className="text-[#dee5ff]/50">System Boot</span>
            <span className="text-primary">{progress}%</span>
          </div>
          <div className="h-1 w-full bg-surface-container overflow-hidden rounded-full">
            <div 
              className="h-full bg-primary transition-all duration-100 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoadingScreen

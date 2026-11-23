import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css'
import '@fontsource/ibm-plex-sans-arabic/latin-400.css'
import '@fontsource/ibm-plex-sans-arabic/latin-600.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-600.css'
import './index.css'
import App from './App.tsx'
import { Component, type ReactNode } from 'react'

/** If anything ever fails while drawing the page, show a way out instead of a blank screen. */
class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: unknown) {
    console.error(err)
  }
  reset = () => {
    try {
      sessionStorage.removeItem('lazem-directives-draft-v1')
    } catch {
      /* ignore */
    }
    location.reload()
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div dir="rtl" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#081D24', color: '#EEF7F6', fontFamily: "'TheSans','IBM Plex Sans Arabic',Tahoma,sans-serif" }}>
        <div style={{ maxWidth: 420, textAlign: 'center', lineHeight: 1.9 }}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>تعذّر عرض الصفحة</div>
          <div style={{ fontSize: 14, color: '#A9C6C8', marginBottom: 18 }}>
            غالباً بسبب مسودة قديمة محفوظة في هذا المتصفح. اضغط الزر لمسح المسودة وإعادة التحميل. السجل لن يُحذف.
          </div>
          <button onClick={this.reset} style={{ background: '#8FE0CF', color: '#081D24', border: 0, borderRadius: 100, padding: '10px 22px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            مسح المسودة وإعادة التحميل
          </button>
        </div>
      </div>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Guard>
      <App />
    </Guard>
  </StrictMode>,
)

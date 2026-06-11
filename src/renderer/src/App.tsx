import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { AppConfig } from '../../shared/config'
import { TopBar } from './components/TopBar'
import { api } from './lib/api'
import './App.css'

type UiState = AppConfig['ui']

function App(): JSX.Element {
  const [ui, setUi] = useState<UiState | null>(null)

  useEffect(() => {
    api
      .invoke('config:get')
      .then((config) => setUi(config.ui))
      .catch((err) => {
        console.error(err)
        setUi({ theme: 'dark', direction: 'tree' })
      })
  }, [])

  useEffect(() => {
    if (ui) document.documentElement.dataset.theme = ui.theme
  }, [ui])

  const update = (patch: Partial<UiState>): void => {
    setUi((prev) => (prev ? { ...prev, ...patch } : prev))
    api.invoke('config:patch', { ui: patch }).catch(console.error)
  }

  if (!ui) {
    // One frame at most; avoids a default-theme flash before hydration.
    return <></>
  }

  return (
    <>
      <TopBar
        theme={ui.theme}
        direction={ui.direction}
        onThemeToggle={() => update({ theme: ui.theme === 'dark' ? 'light' : 'dark' })}
        onDirectionChange={(direction) => update({ direction })}
        onRefresh={() => {
          /* wired to ADO sync in M3 */
        }}
      />
      <main className="content">
        {ui.direction === 'tree' ? (
          <div className="content-placeholder">Tree view — workspaces &amp; worktrees land here</div>
        ) : (
          <div className="content-placeholder">Board view — task-centric canvas lands here (M4)</div>
        )}
      </main>
    </>
  )
}

export default App

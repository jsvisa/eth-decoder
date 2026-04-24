import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

const RELEASES_URL = 'https://api.github.com/repos/Delweng/evm-func-signs/releases/latest'
const LAST_UPDATE_KEY = 'func_signs_last_update'

export default function UpdateChecker() {
  const [update, setUpdate] = useState(null) // { tag } | null
  const [status, setStatus] = useState('idle') // idle | applying | done | error

  useEffect(() => {
    checkForUpdate()
  }, [])

  async function checkForUpdate() {
    try {
      const res = await fetch(RELEASES_URL)
      if (!res.ok) return
      const release = await res.json()
      const latestTag = release.tag_name
      const lastTag = localStorage.getItem(LAST_UPDATE_KEY)
      if (latestTag && latestTag !== lastTag) {
        setUpdate({ tag: latestTag })
      }
    } catch {
      // Ignore — network may not be available
    }
  }

  async function handleApply() {
    try {
      const selected = await open({
        title: 'Select downloaded delta CSV',
        filters: [{ name: 'Delta CSV', extensions: ['csv'] }],
      })
      if (!selected) return
      setStatus('applying')
      const result = await invoke('apply_delta', { file_path: selected })
      localStorage.setItem(LAST_UPDATE_KEY, update.tag)
      setStatus('done')
      setUpdate(null)
    } catch (err) {
      setStatus('error')
    }
  }

  if (!update) return null

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16,
      background: '#1e293b', border: '1px solid #334155',
      borderRadius: 8, padding: '12px 16px',
      maxWidth: 300, zIndex: 1000, fontSize: 13,
    }}>
      <div style={{ marginBottom: 8, color: '#e2e8f0' }}>
        New signatures available ({update.tag})
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
        Download the delta CSV from GitHub and import it to get the latest signatures.
      </div>
      {status === 'idle' && (
        <button onClick={handleApply} style={{ marginRight: 8, fontSize: 12, cursor: 'pointer' }}>
          Import Delta…
        </button>
      )}
      {status === 'applying' && <span style={{ color: '#94a3b8' }}>Applying…</span>}
      {status === 'done' && <span style={{ color: '#4ade80' }}>Updated!</span>}
      {status === 'error' && <span style={{ color: '#f87171' }}>Failed — try again</span>}
      <button
        onClick={() => setUpdate(null)}
        style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', float: 'right', fontSize: 13 }}
      >
        ✕
      </button>
    </div>
  )
}

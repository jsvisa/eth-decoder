// desktop/components/UpdateChecker.jsx
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import styles from './UpdateChecker.module.css'

const RELEASES_URL = 'https://api.github.com/repos/Delweng/evm-func-signs/releases/latest'
const LAST_UPDATE_KEY = 'func_signs_last_update'

export default function UpdateChecker() {
  const [update, setUpdate] = useState(null)
  const [status, setStatus] = useState('idle')

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
    } catch { /* ignore network errors */ }
  }

  async function handleApply() {
    try {
      const selected = await open({
        title: 'Select downloaded delta CSV',
        filters: [{ name: 'Delta CSV', extensions: ['csv'] }],
      })
      if (!selected) return
      setStatus('applying')
      await invoke('apply_delta', { file_path: selected })
      localStorage.setItem(LAST_UPDATE_KEY, update.tag)
      setStatus('done')
      setUpdate(null)
    } catch {
      setStatus('error')
    }
  }

  if (!update) return null

  return (
    <div className={styles.toast}>
      <div className={styles.title}>New signatures available ({update.tag})</div>
      <div className={styles.desc}>
        Download the delta CSV from GitHub and import it to get the latest signatures.
      </div>
      {status === 'idle'     && <button className={styles.btn} onClick={handleApply}>Import Delta…</button>}
      {status === 'applying' && <span className={styles.applying}>Applying…</span>}
      {status === 'done'     && <span className={styles.done}>Updated!</span>}
      {status === 'error'    && <span className={styles.error}>Failed — try again</span>}
      <button className={styles.dismiss} onClick={() => setUpdate(null)}>✕</button>
    </div>
  )
}

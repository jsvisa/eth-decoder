// desktop/components/SetupScreen.jsx
import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import styles from './SetupScreen.module.css'

export default function SetupScreen({ onComplete }) {
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  async function handleImport() {
    try {
      const selected = await open({
        title: 'Select evm_func_signs.csv file',
        filters: [{ name: 'Signatures', extensions: ['csv'] }],
      })
      if (!selected) return
      setStatus('importing')
      setMessage('Importing signatures… this may take a few minutes for the full dataset.')
      const result = await invoke('import_signatures', { file_path: selected })
      setMessage(`Done — ${result.rows_imported.toLocaleString()} signatures imported.`)
      setStatus('done')
      setTimeout(onComplete, 1500)
    } catch (err) {
      setMessage(err.message || String(err))
      setStatus('error')
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.inner}>
        <h2 className={styles.title}>Welcome to EVM Decoder</h2>
        <p className={styles.desc}>
          To decode transaction calldata offline, download the function signatures database and import it here.
        </p>
        <p className={styles.downloadLink}>
          Download <strong>evm_func_signs.csv</strong> from{' '}
          <a
            href="https://github.com/Delweng/evm-func-signs/releases/latest"
            target="_blank"
            rel="noreferrer"
            className={styles.link}
          >
            GitHub Releases
          </a>
        </p>

        {status === 'idle' && (
          <button className={styles.btn} onClick={handleImport}>
            Import Signatures File…
          </button>
        )}
        {status === 'importing' && <p className={styles.message}>{message}</p>}
        {status === 'done'      && <p className={`${styles.message} ${styles.success}`}>{message}</p>}
        {status === 'error'     && <p className={`${styles.message} ${styles.error}`}>Error: {message}</p>}

        <button className={styles.skip} onClick={onComplete}>Skip for now →</button>
      </div>
    </div>
  )
}

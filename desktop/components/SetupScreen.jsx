import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

export default function SetupScreen({ onComplete }) {
  const [status, setStatus] = useState('idle') // idle | importing | done | error
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
    <div style={{ padding: '60px 40px', maxWidth: 520, margin: '60px auto', textAlign: 'center' }}>
      <h2 style={{ marginBottom: 12 }}>Welcome to EVM Decoder</h2>
      <p style={{ color: '#aaa', lineHeight: 1.6 }}>
        To decode transaction calldata offline, download the function signatures database and import it here.
      </p>
      <p style={{ fontSize: 13, color: '#666', marginTop: 8 }}>
        Download <strong>evm_func_signs.csv</strong> from{' '}
        <a
          href="https://github.com/Delweng/evm-func-signs/releases/latest"
          target="_blank"
          rel="noreferrer"
          style={{ color: '#60a5fa' }}
        >
          GitHub Releases
        </a>
      </p>

      {status === 'idle' && (
        <button
          onClick={handleImport}
          style={{ marginTop: 24, padding: '10px 24px', fontSize: 14, cursor: 'pointer' }}
        >
          Import Signatures File…
        </button>
      )}
      {status === 'importing' && <p style={{ marginTop: 24, color: '#aaa' }}>{message}</p>}
      {status === 'done' && <p style={{ marginTop: 24, color: '#4ade80' }}>{message}</p>}
      {status === 'error' && <p style={{ marginTop: 24, color: '#f87171' }}>Error: {message}</p>}

      <p style={{ marginTop: 32, fontSize: 12, color: '#555' }}>
        You can skip this — ABI fetching from Etherscan will still work without the local database.
      </p>
      <button
        onClick={onComplete}
        style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 12 }}
      >
        Skip for now →
      </button>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import Sidebar from './components/Sidebar'
import SetupScreen from './components/SetupScreen'
import UpdateChecker from './components/UpdateChecker'
import styles from './styles/Layout.module.css'

import DecoderPage from '@app/page.js'
import ContractCallerPage from '@app/contract-caller/page.js'
import ContractsPage from '@app/contracts/page.js'
import AddressBookPage from '@app/address-book/page.js'

const PAGES = {
  'decoder':         DecoderPage,
  'contract-caller': ContractCallerPage,
  'contracts':       ContractsPage,
  'address-book':    AddressBookPage,
}

export default function App() {
  const [activePage, setActivePage] = useState('decoder')
  const [dbReady, setDbReady] = useState(null) // null=loading, true=ready, false=needs setup

  useEffect(() => {
    invoke('get_db_stats')
      .then(stats => setDbReady(stats.row_count > 0))
      .catch(() => setDbReady(false))
  }, [])

  if (dbReady === null) return null // brief loading flash, no spinner needed

  if (!dbReady) {
    return <SetupScreen onComplete={() => setDbReady(true)} />
  }

  const PageComponent = PAGES[activePage]

  return (
    <div className={styles.root}>
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className={styles.content}>
        <PageComponent />
      </main>
      <UpdateChecker />
    </div>
  )
}

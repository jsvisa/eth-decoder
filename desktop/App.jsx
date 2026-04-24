// desktop/App.jsx
import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import Sidebar from './components/Sidebar'
import SetupScreen from './components/SetupScreen'
import UpdateChecker from './components/UpdateChecker'
import styles from './styles/Layout.module.css'

import DecoderPage from './pages/DecoderPage'
import ContractCallerPage from './pages/ContractCallerPage'
import ContractsPage from './pages/ContractsPage'
import AddressBookPage from './pages/AddressBookPage'

const PAGES = {
  'decoder':         DecoderPage,
  'contract-caller': ContractCallerPage,
  'contracts':       ContractsPage,
  'address-book':    AddressBookPage,
}

export default function App() {
  const [activePage, setActivePage] = useState('decoder')
  const [dbReady, setDbReady] = useState(null)
  const [recentItems, setRecentItems] = useState([])

  useEffect(() => {
    invoke('get_db_stats')
      .then(stats => setDbReady(stats.row_count > 0))
      .catch(() => setDbReady(false))
  }, [])

  if (dbReady === null) return null

  if (!dbReady) {
    return <SetupScreen onComplete={() => setDbReady(true)} />
  }

  const PageComponent = PAGES[activePage]

  return (
    <div className={styles.root}>
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        recentItems={recentItems}
      />
      <main className={styles.content}>
        <PageComponent onRecentChange={setRecentItems} onNavigate={setActivePage} />
      </main>
      <UpdateChecker />
    </div>
  )
}

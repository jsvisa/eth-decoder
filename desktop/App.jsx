import { useState } from 'react'
import Sidebar from './components/Sidebar'
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
  const PageComponent = PAGES[activePage]

  return (
    <div className={styles.root}>
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className={styles.content}>
        <PageComponent />
      </main>
    </div>
  )
}

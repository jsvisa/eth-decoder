import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import styles from './Sidebar.module.css'

const NAV_ITEMS = [
  { id: 'decoder',         label: 'Decoder',        icon: '⬡' },
  { id: 'contract-caller', label: 'Contract Caller', icon: '⚙' },
  { id: 'contracts',       label: 'Contracts',       icon: '📄' },
  { id: 'address-book',    label: 'Address Book',    icon: '📖' },
]

export default function Sidebar({ activePage, onNavigate, recentItems = [] }) {
  const [dbCount, setDbCount] = useState(null)

  useEffect(() => {
    invoke('get_db_stats')
      .then(stats => setDbCount(stats.row_count))
      .catch(() => {})
  }, [])

  return (
    <nav className={styles.sidebar}>
      <div className={styles.trafficLights} />

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Tools</div>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`${styles.navItem} ${activePage === item.id ? styles.navItemActive : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span className={styles.navLabel}>{item.label}</span>
          </button>
        ))}
      </div>

      {recentItems.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Recent</div>
          {recentItems.map((item, i) => (
            <button key={i} className={styles.recentItem} onClick={item.onClick} title={item.data}>
              {item.label}
            </button>
          ))}
        </div>
      )}

      <div className={styles.footer}>
        {dbCount !== null && (
          <div className={styles.dbBadge}>
            <span className={styles.dbDot} />
            {dbCount.toLocaleString()} signatures
          </div>
        )}
      </div>
    </nav>
  )
}

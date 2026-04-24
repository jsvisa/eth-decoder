import styles from '../styles/Layout.module.css'

const NAV_ITEMS = [
  { id: 'decoder',         label: 'Decoder',         icon: '⬡' },
  { id: 'contract-caller', label: 'Contract Caller',  icon: '⚙' },
  { id: 'contracts',       label: 'Contracts',        icon: '📄' },
  { id: 'address-book',    label: 'Address Book',     icon: '📖' },
]

export default function Sidebar({ activePage, onNavigate }) {
  return (
    <nav className={styles.sidebar}>
      <div className={styles.sidebarHeader} />
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
    </nav>
  )
}

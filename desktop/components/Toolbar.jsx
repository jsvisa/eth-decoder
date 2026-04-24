import styles from './Toolbar.module.css'

export default function Toolbar({ children }) {
  return (
    <div className={styles.toolbar}>
      {children}
    </div>
  )
}

export function ToolbarSpacer() {
  return <div className={styles.spacer} />
}

export function ToolbarButton({ onClick, children, variant }) {
  return (
    <button
      className={`${styles.btn} ${variant === 'active' ? styles.btnActive : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function ToolbarSep() {
  return <div className={styles.sep} />
}

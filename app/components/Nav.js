'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './Nav.module.css'

export default function Nav() {
  const pathname = usePathname()

  return (
    <nav className={styles.nav}>
      <div className={styles.container}>
        <div className={styles.links}>
          <Link
            href="/"
            className={`${styles.link} ${pathname === '/' ? styles.active : ''}`}
          >
            Tx Decoder
          </Link>
          <Link
            href="/contract-caller"
            className={`${styles.link} ${pathname === '/contract-caller' ? styles.active : ''}`}
          >
            Contract Caller
          </Link>
          <Link
            href="/address-book"
            className={`${styles.link} ${pathname === '/address-book' ? styles.active : ''}`}
          >
            Address Book
          </Link>
        </div>
      </div>
    </nav>
  )
}

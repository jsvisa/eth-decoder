"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "../contexts/ThemeContext";
import styles from "./Nav.module.css";

export default function Nav() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className={styles.nav}>
      <div className={styles.container}>
        <div className={styles.links}>
          <Link
            href="/"
            className={`${styles.link} ${pathname === "/" ? styles.active : ""}`}
          >
            Tx Decoder
          </Link>
          <Link
            href="/event-decoder"
            className={`${styles.link} ${pathname === "/event-decoder" ? styles.active : ""}`}
          >
            Event Decoder
          </Link>
          <Link
            href="/contract-caller"
            className={`${styles.link} ${pathname === "/contract-caller" ? styles.active : ""}`}
          >
            Contract Caller
          </Link>
          <Link
            href="/address-book"
            className={`${styles.link} ${pathname === "/address-book" ? styles.active : ""}`}
          >
            Address Book
          </Link>
          <Link
            href="/contracts"
            className={`${styles.link} ${pathname === "/contracts" ? styles.active : ""}`}
          >
            Contracts
          </Link>
        </div>
        <button
          onClick={toggleTheme}
          className={styles.themeToggle}
          title={
            theme === "light" ? "Switch to dark mode" : "Switch to light mode"
          }
        >
          {theme === "light" ? "🌙" : "☀️"}
        </button>
      </div>
    </nav>
  );
}

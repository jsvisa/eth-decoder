"use client";

// The home page is now the contract caller.
// Import and render the contract caller component directly.
import ContractCallerPage from "./contract-caller/page";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.main}>
      <ContractCallerPage />
    </main>
  );
}

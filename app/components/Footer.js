import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <span>EVM Tools</span>
      <span className={styles.version}>
        {process.env.NEXT_PUBLIC_APP_VERSION}
      </span>
    </footer>
  );
}

import styles from "./Footer.module.css";

const GITHUB_REPO_URL = "https://github.com/jsvisa/eth-decoder";
const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

export default function Footer() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  const commitSha = process.env.NEXT_PUBLIC_APP_COMMIT_SHA;

  return (
    <footer className={styles.footer}>
      <span>EVM Tools</span>
      {COMMIT_SHA_PATTERN.test(commitSha) ? (
        <a
          className={styles.version}
          href={`${GITHUB_REPO_URL}/commit/${commitSha}`}
          target="_blank"
          rel="noreferrer"
          title={`Commit ${commitSha}`}
        >
          {version}
        </a>
      ) : (
        <span className={styles.version}>{version}</span>
      )}
    </footer>
  );
}

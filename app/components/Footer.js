import styles from "./Footer.module.css";

const GITHUB_REPO_URL = "https://github.com/jsvisa/eth-decoder";
const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

const formatBuildDate = (iso) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export default function Footer() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  const commitSha = process.env.NEXT_PUBLIC_APP_COMMIT_SHA;
  const buildDate = formatBuildDate(process.env.NEXT_PUBLIC_APP_BUILD_DATE);

  return (
    <footer className={styles.footer}>
      <div className={styles.left}>EVM Tools</div>
      <div className={styles.right}>
        {version &&
          (COMMIT_SHA_PATTERN.test(commitSha) ? (
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
          ))}
        {buildDate && (
          <span className={styles.buildDate}>Built {buildDate}</span>
        )}
      </div>
    </footer>
  );
}

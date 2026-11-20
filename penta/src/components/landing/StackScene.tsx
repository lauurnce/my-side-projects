import styles from "./StackScene.module.css";

export function StackScene() {
  return (
    <section id="stack" className={styles.stack} data-landing="stack" aria-labelledby="stack-title">
      <div className={styles.stage} data-landing="stage">
        <h2 id="stack-title">Three layers. One building.</h2>
      </div>
    </section>
  );
}

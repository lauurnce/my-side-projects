import type { TeacherQuestion } from "@/lib/quiz";
import { builderNotes, hasKey, kindLabels, pointsLabel, questionNumber, shownAnswers, shownOptions } from "./labels";
import styles from "./builder.module.css";

export function QuestionCard({ question, index }: { question: TeacherQuestion; index: number }) {
  const options = shownOptions(question);
  const answers = shownAnswers(question);

  return (
    <div className={styles.card}>
      <p className={styles.cardMeta}>
        <span>{questionNumber(index)}</span>
        <span>{kindLabels[question.kind]}</span>
        <span>{pointsLabel(question.points)}</span>
      </p>
      <p className={styles.prompt} dir="auto">
        {question.prompt}
      </p>
      {options.length > 0 && (
        <ol className={styles.options}>
          {options.map((option, optionIndex) => (
            <li key={optionIndex} className={styles.option} data-correct={option.correct ? "true" : undefined}>
              <span className={styles.optionText} dir="auto">
                {option.text}
              </span>
              {option.correct && <strong className={styles.correct}>Correct</strong>}
            </li>
          ))}
        </ol>
      )}
      {answers.length > 0 && (
        <div className={styles.accepted}>
          <p className={styles.cardLabel}>Accepted answers</p>
          <ul className={styles.options}>
            {answers.map((answer) => (
              <li key={answer} className={styles.option}>
                <span className={styles.optionText} dir="auto">
                  {answer}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!hasKey(question) && <p className={styles.cardNote}>{builderNotes.noKey}</p>}
    </div>
  );
}

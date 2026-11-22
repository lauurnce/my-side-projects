import { TextAreaField } from "./fields";
import { builderNotes } from "./labels";
import styles from "./builder.module.css";

export function TruthChoice({ truth }: { truth: string }) {
  return (
    <fieldset className={styles.choices}>
      <legend className={styles.label}>Right answer</legend>
      {["true", "false"].map((value) => (
        <label key={value} className={styles.choice}>
          <input type="radio" name="truth" value={value} defaultChecked={truth === value} />
          <span>{value === "true" ? "True" : "False"}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function AcceptedAnswers({ accepted }: { accepted: string }) {
  return (
    <TextAreaField
      label="Accepted answers"
      name="accepted"
      rows={4}
      defaultValue={accepted}
      hint={`One per line. ${builderNotes.accepted}`}
    />
  );
}

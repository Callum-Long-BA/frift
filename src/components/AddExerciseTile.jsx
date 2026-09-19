import { MAX_EXERCISES } from '../lib/constants.js';

// Sits after the last chart. Opens the "add an exercise" dialog.
export default function AddExerciseTile({ canAdd, count, atLimit, onAdd }) {
  let note = `${count} of ${MAX_EXERCISES} exercises used`;
  if (atLimit) note = `The limit of ${MAX_EXERCISES} exercises has been reached.`;
  else if (!canAdd) note = 'Choose who you are to add an exercise.';

  return (
    <section className="panel add-tile" aria-label="Add an exercise">
      <button type="button" className="add-tile-btn" onClick={onAdd} disabled={!canAdd || atLimit}>
        <span className="add-tile-plus" aria-hidden="true">
          +
        </span>
        Add exercise
      </button>
      <p className="chart-sub">{note}</p>
    </section>
  );
}

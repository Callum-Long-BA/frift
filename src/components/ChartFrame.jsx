import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const GAP = 24; // space kept between the expanded chart and the edge of the window

// The expanded chart is as wide as the board's four columns of tiles (never wider than the
// window allows), and its height keeps the window's proportions, scaled down to match.
function expandedSize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const board = document.querySelector('.board');
  let boardWidth = vw;
  if (board) {
    const style = getComputedStyle(board);
    boardWidth = board.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  }
  const width = Math.min(boardWidth, vw - 2 * GAP);
  const height = Math.min(vh - 2 * GAP, (width * (vh - 2 * GAP)) / (vw - 2 * GAP));
  return { width: Math.round(width), height: Math.round(height) };
}

// The chrome around every chart tile: title, subtitle, optional controls, the + button,
// and an expand button that opens the same chart larger, to see it in more detail.
// `children` is a function of `full` (true inside the expanded view), so the chart can
// draw itself bigger there.
export default function ChartFrame({ headingId, title, subtitle, controls, addLabel, canAdd, onAdd, children }) {
  const [full, setFull] = useState(false);
  const [size, setSize] = useState(null);
  const dialogRef = useRef(null);

  // Size the expanded view before it is shown, and again whenever the window changes size.
  useLayoutEffect(() => {
    if (!full) return undefined;
    const resize = () => setSize(expandedSize());
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [full]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (full && dialog && !dialog.open) dialog.showModal();
  }, [full]);

  const addButton = (
    <span title={canAdd ? addLabel : 'Choose who you are to log'}>
      <button type="button" className="add-btn" onClick={onAdd} disabled={!canAdd} aria-label={addLabel}>
        +
      </button>
    </span>
  );

  return (
    <section className="panel chart-panel" aria-labelledby={headingId}>
      <header className="chart-head">
        <div className="chart-titles">
          <h2 id={headingId}>{title}</h2>
          <p className="chart-sub">{subtitle}</p>
        </div>
        <div className="chart-actions">
          <button type="button" className="icon-btn expand-btn" onClick={() => setFull(true)} aria-label={`Expand ${title} to full screen`} title="Full screen">
            <ExpandIcon />
          </button>
          {addButton}
        </div>
      </header>
      {controls && <div className="chart-controls">{controls}</div>}

      <div className="chart-body">{children(false)}</div>

      {full && (
        <dialog
          ref={dialogRef}
          className="full-dialog"
          style={size ?? undefined}
          aria-labelledby={`${headingId}-full`}
          onClose={() => setFull(false)}
        >
          <div className="full-inner">
            <header className="chart-head">
              <div className="chart-titles">
                <h2 id={`${headingId}-full`}>{title}</h2>
                <p className="chart-sub">{subtitle}</p>
              </div>
              <div className="chart-actions">
                {addButton}
                <button type="button" className="icon-btn" aria-label="Close full screen" onClick={() => dialogRef.current?.close()}>
                  ×
                </button>
              </div>
            </header>
            {controls && <div className="chart-controls">{controls}</div>}
            <div className="chart-body">{children(true)}</div>
          </div>
        </dialog>
      )}
    </section>
  );
}

function ExpandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 2h4v4M6 14H2v-4M14 2 9.5 6.5M2 14l4.5-4.5" />
    </svg>
  );
}

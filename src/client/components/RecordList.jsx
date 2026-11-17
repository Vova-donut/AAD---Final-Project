// Cards show saved records, with explicit controls for edit and delete.
export default function RecordList({ kind, items, disabled, onEdit, onDelete }) {
  const isTask = kind === 'tasks';
  if (!items.length)
    return (
      <div className="empty">
        <span className="empty-mark">{isTask ? '✓' : '◷'}</span>
        <h3>{isTask ? 'A clear starting point' : 'Time to make time'}</h3>
        <p>
          {isTask
            ? 'Add your first task, or adjust your filters.'
            : 'Plan a study session, or adjust your filters.'}
        </p>
      </div>
    );
  return (
    <div className="record-list">
      {items.map((item) => (
        <article className="record" key={item._id}>
          <div className={`record-icon ${isTask ? item.priority : 'session'}`}>
            {isTask ? '✓' : '◷'}
          </div>
          <div className="record-main">
            <small>{item.course}</small>
            <h3>{item.title}</h3>
            <p>
              {isTask
                ? `Due ${new Date(item.dueDate + 'T00:00:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : `${new Date(item.startAt).toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })} · ${item.duration} min`}
              {isTask && ` · ${item.priority} priority`}
            </p>
            {item.notes && <p className="record-notes">{item.notes}</p>}
          </div>
          <span className={`status ${item.status}`}>{item.status.replace('-', ' ')}</span>
          <div className="record-actions">
            <button
              disabled={disabled}
              onClick={() => onEdit(item)}
              aria-label={`Edit ${item.title}`}
            >
              Edit
            </button>
            <button
              className="danger-text"
              disabled={disabled}
              onClick={() => onDelete(item)}
              aria-label={`Delete ${item.title}`}
            >
              Delete
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

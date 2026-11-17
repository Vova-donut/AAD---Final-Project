import { useEffect, useRef, useState } from 'react';
import { taskSchema, sessionSchema } from '../../shared/validation.js';
// One modal handles the two resource schemas while keeping their fields distinct.
export default function RecordForm({ kind, record, onSave, onClose }) {
  const isTask = kind === 'tasks',
    dialog = useRef(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  const localDate = (value) => {
    const d = new Date(value);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      if (!isTask) {
        data.duration = Number(data.duration);
        data.startAt = new Date(data.startAt).toISOString();
      }
      const parsed = (isTask ? taskSchema : sessionSchema).parse(data);
      await onSave(parsed, record?._id);
      onClose();
    } catch (e) {
      setError(e.issues?.map((i) => `${i.path.join('.')}: ${i.message}`).join('. ') || e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog ref={dialog} onCancel={onClose} aria-labelledby="form-title">
      <div className="modal-heading">
        <h2 id="form-title">
          {record ? 'Edit' : 'New'} {isTask ? 'task' : 'study session'}
        </h2>
        <button onClick={onClose} aria-label="Close form" disabled={busy}>
          ×
        </button>
      </div>
      <form onSubmit={submit}>
        <label>
          Title
          <input name="title" required minLength={2} maxLength={120} defaultValue={record?.title} />
        </label>
        <label>
          Course
          <input
            name="course"
            required
            minLength={2}
            maxLength={80}
            defaultValue={record?.course}
          />
        </label>
        <div className="form-row">
          {isTask ? (
            <>
              <label>
                Due date
                <input
                  name="dueDate"
                  type="date"
                  required
                  defaultValue={record?.dueDate || new Date().toISOString().slice(0, 10)}
                />
              </label>
              <label>
                Priority
                <select name="priority" defaultValue={record?.priority || 'medium'}>
                  {['low', 'medium', 'high'].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <>
              <label>
                Start time
                <input
                  name="startAt"
                  type="datetime-local"
                  required
                  defaultValue={localDate(record?.startAt || new Date())}
                />
              </label>
              <label>
                Minutes
                <input
                  name="duration"
                  type="number"
                  min="15"
                  max="240"
                  step="1"
                  required
                  defaultValue={record?.duration || 45}
                />
              </label>
            </>
          )}
        </div>
        <label>
          Status
          <select name="status" defaultValue={record?.status || (isTask ? 'todo' : 'planned')}>
            {(isTask ? ['todo', 'in-progress', 'done'] : ['planned', 'completed']).map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Notes
          <textarea name="notes" maxLength={1000} rows="3" defaultValue={record?.notes} />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save ' + (isTask ? 'task' : 'session')}
          </button>
        </div>
      </form>
    </dialog>
  );
}

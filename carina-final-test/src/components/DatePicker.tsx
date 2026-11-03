import { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

const pad = (n: number) => String(n).padStart(2, '0');
const toKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function DatePicker({ value, onChange, placeholder = 'Select date', className = '' }: DatePickerProps) {
  const datePart = value ? value.slice(0, 10) : '';
  const selected = datePart ? new Date(`${datePart}T00:00:00`) : null;
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const initial = selected ?? new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });

  useEffect(() => {
    if (open) {
      const initial = selected ?? new Date();
      setMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
    }
  }, [value, open]);

  const firstWeekday = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: firstWeekday + daysInMonth }, (_, index) =>
    index < firstWeekday ? null : index - firstWeekday + 1
  );
  const monthLabel = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className={`date-picker-wrap custom-date-picker ${className}`.trim()}>
      <button type="button" className="date-picker-trigger" aria-label="Choose date" aria-expanded={open} onClick={() => setOpen(current => !current)}>
        <span>{selected ? selected.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : placeholder}</span>
        <CalendarDays size={16} />
      </button>
      {open && (
        <div className="date-picker-popover">
          <div className="date-picker-head">
            <button type="button" aria-label="Previous month" onClick={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
            <strong>{monthLabel}</strong>
            <button type="button" aria-label="Next month" onClick={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
          </div>
          <div className="date-weekdays">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
          <div className="date-grid">
            {cells.map((day, index) => day === null
              ? <span key={`blank-${index}`} />
              : <button type="button" key={day} className={selected && day === selected.getDate() && month.getMonth() === selected.getMonth() && month.getFullYear() === selected.getFullYear() ? 'selected' : ''} onClick={() => { onChange(toKey(new Date(month.getFullYear(), month.getMonth(), day))); setOpen(false); }}>{day}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

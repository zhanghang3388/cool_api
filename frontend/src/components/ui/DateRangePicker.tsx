import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, X } from 'lucide-react';

/**
 * Custom dark-themed date range picker. Two months side by side, click once
 * for the start, click again for the end. Earlier-than-start clicks swap
 * the bounds. Output is a `{ from, to }` pair of `YYYY-MM-DD` strings —
 * empty string means "no bound on that side".
 *
 * Hand-rolled instead of pulling in react-day-picker etc. so the styling
 * matches the rest of the site (base-* + amber accent) and we don't add a
 * 50KB dep for one input.
 */
export interface DateRange {
  from: string;
  to: string;
}

interface Props {
  value: DateRange;
  onChange: (next: DateRange) => void;
  placeholder?: string;
}

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parse(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function monthLabel(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

const WEEK = ['一', '二', '三', '四', '五', '六', '日'];

export default function DateRangePicker({
  value,
  onChange,
  placeholder = '选择时间范围',
}: Props) {
  const [open, setOpen] = useState(false);
  const [pendingFrom, setPendingFrom] = useState<Date | null>(parse(value.from));
  const [pendingTo, setPendingTo] = useState<Date | null>(parse(value.to));
  const [hover, setHover] = useState<Date | null>(null);
  const initialAnchor = parse(value.from) ?? parse(value.to) ?? new Date();
  const [leftMonth, setLeftMonth] = useState<Date>(startOfMonth(initialAnchor));

  const ref = useRef<HTMLDivElement>(null);

  // Sync pending state if the parent clears or rewrites the value.
  useEffect(() => {
    setPendingFrom(parse(value.from));
    setPendingTo(parse(value.to));
  }, [value.from, value.to]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const display = (() => {
    if (value.from && value.to) return `${value.from} → ${value.to}`;
    if (value.from) return `${value.from} 起`;
    if (value.to) return `至 ${value.to}`;
    return placeholder;
  })();
  const hasValue = !!(value.from || value.to);

  const handleDayClick = (d: Date) => {
    if (!pendingFrom || (pendingFrom && pendingTo)) {
      // Start a fresh selection.
      setPendingFrom(d);
      setPendingTo(null);
      return;
    }
    if (d < pendingFrom) {
      // Earlier than the anchor — swap so the anchor stays on the left.
      setPendingTo(pendingFrom);
      setPendingFrom(d);
    } else {
      setPendingTo(d);
    }
  };

  const apply = () => {
    if (!pendingFrom) {
      onChange({ from: '', to: '' });
    } else {
      onChange({
        from: fmt(pendingFrom),
        // No `to` picked yet → treat the click as "single day" so the
        // user can apply a one-day range without a second click.
        to: fmt(pendingTo ?? pendingFrom),
      });
    }
    setOpen(false);
  };

  const reset = () => {
    setPendingFrom(null);
    setPendingTo(null);
  };

  const clearAndClose = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    reset();
    onChange({ from: '', to: '' });
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="bg-base-200 border border-base-300 rounded-lg px-3 py-1.5 text-xs text-gray-200 hover:border-amber-500/60 focus:outline-none focus:border-amber-500 flex items-center gap-2 min-w-[220px] transition-colors"
      >
        <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className={`flex-1 text-left font-mono ${hasValue ? 'text-gray-200' : 'text-gray-500'}`}>
          {display}
        </span>
        {hasValue && (
          <span
            role="button"
            onClick={clearAndClose}
            className="w-4 h-4 inline-flex items-center justify-center rounded hover:bg-base-300 text-gray-500 hover:text-rose-400"
            aria-label="清除"
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-2 right-0 stat-card rounded-lg border border-base-300 bg-base-100/98 backdrop-blur p-3 shadow-2xl">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setLeftMonth(addMonths(leftMonth, -1))}
              className="px-2 py-0.5 rounded text-gray-400 hover:text-amber-400 hover:bg-base-200 text-sm"
            >
              ‹
            </button>
            <div className="text-[11px] text-gray-400 font-mono">
              {monthLabel(leftMonth)} · {monthLabel(addMonths(leftMonth, 1))}
            </div>
            <button
              type="button"
              onClick={() => setLeftMonth(addMonths(leftMonth, 1))}
              className="px-2 py-0.5 rounded text-gray-400 hover:text-amber-400 hover:bg-base-200 text-sm"
            >
              ›
            </button>
          </div>
          <div className="flex gap-4">
            <MonthGrid
              month={leftMonth}
              from={pendingFrom}
              to={pendingTo}
              hover={hover}
              onClick={handleDayClick}
              onHover={setHover}
            />
            <MonthGrid
              month={addMonths(leftMonth, 1)}
              from={pendingFrom}
              to={pendingTo}
              hover={hover}
              onClick={handleDayClick}
              onHover={setHover}
            />
          </div>
          <div className="flex justify-between items-center mt-3 pt-3 border-t border-base-300">
            <div className="text-[10px] text-gray-500 font-mono">
              {pendingFrom ? fmt(pendingFrom) : '—'}
              {' → '}
              {pendingTo
                ? fmt(pendingTo)
                : pendingFrom && hover && hover >= pendingFrom
                  ? fmt(hover)
                  : '—'}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={reset}
                className="text-[11px] text-gray-400 hover:text-gray-200 px-2"
              >
                重置
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={!pendingFrom}
                className="text-[11px] px-3 py-1 rounded bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-black font-medium transition-colors"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface MonthGridProps {
  month: Date;
  from: Date | null;
  to: Date | null;
  hover: Date | null;
  onClick: (d: Date) => void;
  onHover: (d: Date | null) => void;
}

function MonthGrid({ month, from, to, hover, onClick, onHover }: MonthGridProps) {
  const cells = useMemo(() => buildMonthCells(month), [month]);
  const today = new Date();
  // While picking the second date, fall back to the hovered cell so the
  // user can preview the in-range highlight.
  const effectiveTo = to ?? (from && hover && hover >= from ? hover : null);

  return (
    <div>
      <div className="text-[10px] text-gray-500 font-mono mb-1 text-center">
        {monthLabel(month)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEK.map((w) => (
          <div key={w} className="text-[10px] text-gray-600 text-center py-1 w-8">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === month.getMonth();
          const isToday = sameDay(d, today);
          const isFrom = !!from && sameDay(d, from);
          const isTo = !!to && sameDay(d, to);
          const inRange =
            !!from && !!effectiveTo && d > from && d < effectiveTo && !isFrom && !isTo;

          const base =
            'w-8 h-7 text-[11px] font-mono flex items-center justify-center rounded transition-colors';
          let cls = base;
          if (!inMonth) {
            cls += ' text-gray-700 cursor-default';
          } else if (isFrom || isTo) {
            cls += ' bg-amber-500/30 text-amber-200 ring-1 ring-amber-500/50 cursor-pointer';
          } else if (inRange) {
            cls += ' bg-amber-500/10 text-amber-300 cursor-pointer';
          } else {
            cls += ' text-gray-300 hover:bg-base-300 cursor-pointer';
          }
          if (isToday && !isFrom && !isTo) {
            cls += ' ring-1 ring-amber-500/30';
          }

          return (
            <button
              key={i}
              type="button"
              disabled={!inMonth}
              onMouseEnter={() => inMonth && onHover(d)}
              onMouseLeave={() => onHover(null)}
              onClick={() => inMonth && onClick(d)}
              className={cls}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 42-cell grid (6 rows × 7 cols), Monday-first, with leading/trailing days. */
function buildMonthCells(month: Date): Date[] {
  const first = startOfMonth(month);
  // getDay(): 0 = Sunday..6 = Saturday → convert to 0 = Mon..6 = Sun.
  const offset = (first.getDay() + 6) % 7;
  const arr: Date[] = [];
  // Leading previous-month days.
  for (let i = offset; i > 0; i--) {
    const d = new Date(first);
    d.setDate(first.getDate() - i);
    arr.push(d);
  }
  // Current month days.
  const next = addMonths(first, 1);
  for (const d = new Date(first); d < next; d.setDate(d.getDate() + 1)) {
    arr.push(new Date(d));
  }
  // Trailing next-month days to fill 42 cells.
  while (arr.length < 42) {
    const last = arr[arr.length - 1];
    const d = new Date(last);
    d.setDate(last.getDate() + 1);
    arr.push(d);
  }
  return arr;
}

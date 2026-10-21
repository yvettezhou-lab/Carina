import { useState } from 'react';
import type { ReflectionBreakdown, ReflectionTrendPoint } from '@/services/statistics';

type Props =
  | { mode: 'category' | 'account' | 'person'; chartType: 'donut' | 'bar'; data: ReflectionBreakdown[]; selectedId?: string; onSelect: (id: string) => void; onToggleChart: () => void }
  | { mode: 'trend'; chartType: 'bar'; data: ReflectionTrendPoint[]; selectedId?: string; onSelect: (id: string) => void; onToggleChart: () => void };

function Donut({ data, selectedId, onSelect, onToggleChart }: { data: ReflectionBreakdown[]; selectedId?: string; onSelect: (id: string) => void; onToggleChart: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const visibleData = showAll ? data : data.slice(0, 5);
  const total = visibleData.reduce((sum, item) => sum + item.amount, 0);
  let cursor = 0;
  const segments = visibleData.map((item, index) => {
    const start = cursor;
    cursor += total ? item.amount / total : 0;
    return { ...item, start, end: cursor, index };
  });
  const background = segments.length
    ? `conic-gradient(${segments.map((s) => `${['#8f6f37', '#6e836d', '#5b6878', '#a67c52', '#8b7d6b', '#6f6252'][s.index]} ${s.start * 100}% ${s.end * 100}%`).join(',')})`
    : 'rgba(168,135,74,.12)';

  return (
    <div className="reflection-donut-layout">
      <button type="button" className="reflection-donut reflection-chart-clickable" style={{ background }} aria-label="Spending distribution. Tap to switch to bar chart" onClick={onToggleChart}>
        <div className="reflection-donut-hole">
          <small>Total</small>
          <strong>¥{data.reduce((sum, item) => sum + item.amount, 0).toFixed(0)}</strong>
        </div>
      </button>
      <div className="reflection-breakdown-list">
        {data.length === 0 ? (
          <div className="empty"><span className="empty-script">A quiet month</span><p>No spending recorded yet.</p></div>
        ) : visibleData.map((item) => (
          <button className={`reflection-breakdown-row ${selectedId === item.id ? 'selected' : ''}`} key={item.id} onClick={() => onSelect(item.id)}>
            <span><i className="reflection-swatch" />{item.name}</span>
            <strong>¥{item.amount.toFixed(2)}</strong>
          </button>
        ))}
        <button type="button" className="reflection-view-all" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show less' : 'View all'}</button>
      </div>
    </div>
  );
}

function BarBreakdown({ data, selectedId, onSelect, onToggleChart }: { data: ReflectionBreakdown[]; selectedId?: string; onSelect: (id: string) => void; onToggleChart: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const top = showAll ? data : data.slice(0, 5);
  const max = Math.max(1, ...top.map((item) => item.amount));
  return (
    <div className="reflection-bar-chart" role="button" tabIndex={0}
      onClick={onToggleChart}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onToggleChart(); }}
      aria-label="Spending bar chart. Tap to switch to donut chart">
      {top.length === 0 ? (
        <div className="empty"><span className="empty-script">A quiet month</span><small>No spending recorded yet.</small></div>
      ) : top.map((item) => (
        <button type="button" className={`reflection-bar-row ${selectedId === item.id ? 'selected' : ''}`} key={item.id}
          onClick={(event) => { event.stopPropagation(); onSelect(item.id); }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.stopPropagation();
              if (event.key === ' ') event.preventDefault();
            }
          }}>
          <span className="reflection-bar-label">{item.name}</span>
          <span className="reflection-bar-track"><i onClick={(e) => { e.stopPropagation(); onToggleChart(); }} style={{ width: `${Math.max(2, item.amount / max * 100)}%` }} /></span>
          <strong>¥{item.amount.toFixed(2)}</strong>
        </button>
      ))}
      <button type="button" className="reflection-view-all" onClick={(event) => { event.stopPropagation(); setShowAll(v => !v); }}>{showAll ? 'Show less' : 'View all'}</button>
    </div>
  );
}

function Trend({ data, selectedId, onSelect }: { data: ReflectionTrendPoint[]; selectedId?: string; onSelect: (id: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const max = Math.max(1, ...data.flatMap((item) => [item.income, item.expense]));
  return (
    <div className="reflection-trend">
      <div className="reflection-trend-chart">
        {data.map((item) => (
          <button className={`reflection-trend-month ${selectedId === item.key ? 'selected' : ''}`} key={item.key} onClick={() => onSelect(item.key)} aria-label={`${item.label} trend`}>
            <div className="reflection-trend-bars">
              <span className="income" style={{ height: `${Math.max(3, item.income / max * 100)}%` }} />
              <span className="expense" style={{ height: `${Math.max(3, item.expense / max * 100)}%` }} />
            </div>
            <small>{item.label}</small>
          </button>
        ))}
      </div>
      <div className="trend-legend"><span><i className="income-dot" /> Income</span><span><i className="expense-dot" /> Expense</span></div>
      <button type="button" className="reflection-view-all" onClick={() => setShowAll(v => !v)}>{showAll ? 'Hide details' : 'View all'}</button>
      {showAll && <div className="reflection-trend-all">{data.map(item => <button type="button" key={item.key} onClick={() => onSelect(item.key)}><span>{item.label}</span><span>Income ¥{item.income.toFixed(2)}</span><span>Expense ¥{item.expense.toFixed(2)}</span></button>)}</div>}
    </div>
  );
}

export function ReflectionChart(props: Props) {
  if (props.mode === 'trend') return <Trend data={props.data} selectedId={props.selectedId} onSelect={props.onSelect} />;
  if (props.chartType === 'bar') return <BarBreakdown data={props.data} selectedId={props.selectedId} onSelect={props.onSelect} onToggleChart={props.onToggleChart} />;
  return <Donut data={props.data} selectedId={props.selectedId} onSelect={props.onSelect} onToggleChart={props.onToggleChart} />;
}

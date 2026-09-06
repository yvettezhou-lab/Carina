import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '@/database/db';
import type { Account, Category, Person, Transaction } from '@/models';
import { buildReflectionAnnualData, buildReflectionData, filterReflectionAnnualTransactions, filterReflectionTransactions, filterReflectionTrendTransactions } from '@/services/statistics';
import { ReflectionChart } from '@/components/ReflectionChart';

type ReflectionMode = 'category' | 'account' | 'person' | 'trend';
type ReflectionPeriod = 'month' | 'year';

export function Reflection() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [period, setPeriod] = useState<ReflectionPeriod>('month');
  const [mode, setMode] = useState<ReflectionMode>('category');
  const [selectedId, setSelectedId] = useState<string>();
  const [chartType, setChartType] = useState<'donut' | 'bar'>('donut');
  const [showAllDrillDown, setShowAllDrillDown] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([db.transactions.toArray(), db.categories.toArray(), db.accounts.toArray(), db.people.toArray()]).then(([tx, cats, accts, ppl]) => {
      if (!alive) return;
      setTransactions(tx);
      setCategories(cats);
      setAccounts(accts);
      setPeople(ppl);
    });
    return () => { alive = false; };
  }, []);

  const data = useMemo(() => buildReflectionData(transactions, categories, accounts, year, month), [transactions, categories, accounts, year, month]);
  const annualData = useMemo(() => buildReflectionAnnualData(transactions, categories, accounts, year), [transactions, categories, accounts, year]);
  const activeData = period === 'year' ? annualData : data;

  const personData = useMemo(() => {
    const start = period === 'year' ? new Date(year, 0, 1) : new Date(year, month, 1);
    const end = period === 'year' ? new Date(year + 1, 0, 1) : new Date(year, month + 1, 1);
    const totals = new Map<string, number>();
    transactions.forEach((transaction) => {
      const date = new Date(transaction.dateTime);
      if (transaction.flow === 'expense' && date >= start && date < end) {
        const id = transaction.personId || '__none__';
        totals.set(id, (totals.get(id) || 0) + transaction.amount);
      }
    });
    const result = people.map((person) => ({ id: person.id, name: person.name, amount: totals.get(person.id) || 0 })).filter((item) => item.amount > 0);
    const noPersonAmount = totals.get('__none__') || 0;
    if (noPersonAmount > 0) result.push({ id: '__none__', name: 'No person', amount: noPersonAmount });
    return result.sort((a, b) => b.amount - a.amount);
  }, [transactions, people, period, year, month]);

  const title = period === 'year' ? String(year) : new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const selectedTransactions = useMemo(() => {
    if (!selectedId) return [];
    if (mode === 'trend') return filterReflectionTrendTransactions(transactions, selectedId);
    if (mode === 'person') {
      const start = period === 'year' ? new Date(year, 0, 1) : new Date(year, month, 1);
      const end = period === 'year' ? new Date(year + 1, 0, 1) : new Date(year, month + 1, 1);
      return transactions.filter((transaction) => {
        const date = new Date(transaction.dateTime);
        const matchesPeriod = date >= start && date < end;
        const matchesPerson = selectedId === '__none__' ? !transaction.personId : transaction.personId === selectedId;
        return matchesPeriod && transaction.flow === 'expense' && matchesPerson;
      });
    }
    return period === 'year'
      ? filterReflectionAnnualTransactions(transactions, year, mode, selectedId)
      : filterReflectionTransactions(transactions, year, month, mode, selectedId);
  }, [transactions, year, month, period, mode, selectedId]);

  function shift(delta: number) {
    if (period === 'year') setYear((current) => current + delta);
    else {
      const d = new Date(year, month + delta, 1);
      setYear(d.getFullYear());
      setMonth(d.getMonth());
    }
    setSelectedId(undefined);
    setShowAllDrillDown(false);
  }

  function selectPeriod(next: ReflectionPeriod) {
    setPeriod(next);
    setSelectedId(undefined);
    setShowAllDrillDown(false);
  }

  function selectMode(next: ReflectionMode) {
    setMode(next);
    setSelectedId(undefined);
    setShowAllDrillDown(false);
    if (next === 'trend') setChartType('bar');
  }

  function toggleChartType() {
    if (mode === 'trend') return;
    setChartType((current) => current === 'donut' ? 'bar' : 'donut');
    setSelectedId(undefined);
    setShowAllDrillDown(false);
  }

  function selectChart(id: string) {
    setSelectedId((current) => current === id ? undefined : id);
    setShowAllDrillDown(false);
  }

  const selectedName = selectedId
    ? mode === 'category'
      ? activeData.category.find((item) => item.id === selectedId)?.name
      : mode === 'account'
        ? activeData.account.find((item) => item.id === selectedId)?.name
        : mode === 'person'
          ? personData.find((item) => item.id === selectedId)?.name
          : activeData.trend.find((item) => item.key === selectedId)?.label
    : undefined;

  return (
    <section>
      <header className="hero-head inner-head">
        <div><div className="script-title">Reflection</div><div className="brand-subtitle">{period === 'year' ? 'A YEAR IN REVIEW' : 'A MONTH IN REVIEW'}</div></div>
        <div className="month-switch">
          <button onClick={() => shift(-1)} aria-label={period === 'year' ? 'Previous year' : 'Previous month'}>‹</button>
          <span>{title}</span>
          <button onClick={() => shift(1)} aria-label={period === 'year' ? 'Next year' : 'Next month'}>›</button>
        </div>
      </header>

      <div className="reflection-period" role="tablist" aria-label="Reflection period" style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',marginBottom:12}}>
        <button role="tab" aria-selected={period === 'month'} className={period === 'month' ? 'active' : ''} onClick={() => selectPeriod('month')}>Month</button>
        <button role="tab" aria-selected={period === 'year'} className={period === 'year' ? 'active' : ''} onClick={() => selectPeriod('year')}>Year</button>
      </div>

      <div className="reflection-summary">
        <div><span>INCOME</span><strong className="positive">¥{activeData.income.toFixed(2)}</strong></div>
        <div><span>EXPENSE</span><strong>¥{activeData.expense.toFixed(2)}</strong></div>
        <div><span>NET FLOW</span><strong className={activeData.netFlow >= 0 ? 'positive' : 'negative'}>{activeData.netFlow >= 0 ? '+' : '−'} ¥{Math.abs(activeData.netFlow).toFixed(2)}</strong></div>
      </div>

      <div className="reflection-mode" style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',whiteSpace:'nowrap'}} role="tablist" aria-label="Reflection analysis">
        {([['category', 'Category'], ['account', 'Account'], ['person', 'Person'], ['trend', 'Trend']] as const).map(([value, label]) => (
          <button key={value} role="tab" aria-selected={mode === value} className={mode === value ? 'active' : ''} onClick={() => selectMode(value)}>{label}</button>
        ))}
      </div>

      <div className="paper-panel reflection-analysis">
        <div className="panel-kicker">{mode === 'category' ? 'WHERE YOUR LIFE FLOWS' : mode === 'account' ? 'WHERE MONEY MOVES' : mode === 'person' ? 'WHO BENEFITS' : period === 'year' ? 'THE YEAR AT A GLANCE' : 'THE LAST SIX MONTHS'}</div>
        <h2>{mode === 'category' ? 'Spending by category' : mode === 'account' ? 'Spending by account' : mode === 'person' ? 'Spending by person' : period === 'year' ? 'Monthly money in motion' : 'Money in motion'}</h2>
        {mode === 'trend' ? (
          <ReflectionChart mode="trend" chartType="bar" data={activeData.trend} selectedId={selectedId} onSelect={selectChart} onToggleChart={toggleChartType} />
        ) : mode === 'category' ? (
          <ReflectionChart mode="category" chartType={chartType} data={activeData.category} selectedId={selectedId} onSelect={selectChart} onToggleChart={toggleChartType} />
        ) : mode === 'account' ? (
          <ReflectionChart mode="account" chartType={chartType} data={activeData.account} selectedId={selectedId} onSelect={selectChart} onToggleChart={toggleChartType} />
        ) : (
          <ReflectionChart mode="person" chartType={chartType} data={personData} selectedId={selectedId} onSelect={selectChart} onToggleChart={toggleChartType} />
        )}

        {selectedId && selectedTransactions.length > 0 && (
          <div className="reflection-drilldown">
            {mode === 'trend' ? (
              <div className="reflection-drilldown-head">
                <div><span className="panel-kicker">DRILL DOWN</span><strong>{selectedName}</strong></div>
                <span><b className="positive">+¥{Math.abs(selectedTransactions.filter((t) => t.flow === 'income' && t.kind !== 'reimbursement').reduce((sum, t) => sum + t.amount, 0)).toFixed(2)}</b>{' '}<b>−¥{selectedTransactions.filter((t) => t.flow === 'expense').reduce((sum, t) => sum + t.amount, 0).toFixed(2)}</b></span>
              </div>
            ) : (
              <div className="reflection-drilldown-head"><div><span className="panel-kicker">DRILL DOWN</span><strong>{selectedName}</strong></div><span>¥{selectedTransactions.reduce((sum, t) => sum + t.amount, 0).toFixed(2)}</span></div>
            )}
            {(showAllDrillDown ? selectedTransactions : selectedTransactions.slice(0, 6)).map((transaction) => (
              <button className="reflection-transaction" key={transaction.id} onClick={() => navigate(`/transactions/${transaction.id}/edit`)}>
                <span><strong>{transaction.description || 'Untitled'}</strong><small>{new Date(transaction.dateTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small></span>
                <b>¥{transaction.amount.toFixed(2)}</b>
              </button>
            ))}
            {selectedTransactions.length > 6 && (
              <button type="button" className="reflection-drilldown-toggle" onClick={() => setShowAllDrillDown((current) => !current)}>{showAllDrillDown ? 'Show less' : `View all ${selectedTransactions.length}`}</button>
            )}
          </div>
        )}
        {selectedId && selectedTransactions.length === 0 && <div className="reflection-selection-note">No records in this selection.</div>}
      </div>

      <div className="reflection-note">
        <span className="script-caption">A small note</span>
        <p>{activeData.expense === 0 ? 'Every ledger has quiet pages.' : activeData.netFlow >= 0 ? `A ${period === 'year' ? 'year' : 'month'} in balance is worth remembering.` : 'Some months are for spending. The ledger simply remembers.'}</p>
      </div>
    </section>
  );
}

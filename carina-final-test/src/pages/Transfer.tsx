import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '@/database/db';
import type { Account } from '@/models';
import { createTransfer } from '@/services/transfers';
import { evaluateAmountExpression } from '@/utils/amount';

export function Transfer() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [dateTime, setDateTime] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    db.accounts
      .filter(x => !x.isArchived)
      .sortBy('sortOrder')
      .then(a => {
        setAccounts(a);
        setFrom(a[0]?.id ?? '');
        setTo(a[1]?.id ?? '');
      });
  }, []);

  async function save() {
    const n = evaluateAmountExpression(amount);
    if (!from || !to) { setError('Please choose both accounts.'); return; }
    if (from === to) { setError('Transfer must use two different accounts.'); return; }
    if (!Number.isFinite(n) || n <= 0) { setError('Please enter a valid amount greater than 0.'); return; }

    setError('');
    setSaving(true);
    try {
      await createTransfer({
        fromAccountId: from,
        toAccountId: to,
        amount: n,
        dateTime: dateTime ? new Date(dateTime).getTime() : undefined,
        note: note.trim() || undefined,
      });
      navigate('/');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <header className="topbar">
        <button className="text-btn" onClick={() => navigate(-1)}>返回</button>
        <h1>转账</h1>
      </header>

      <div className="quick-form">
        <label>
          转出账户
          <select value={from} onChange={e => setFrom(e.target.value)}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>

        <label>
          转入账户
          <select value={to} onChange={e => setTo(e.target.value)}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>

        <label>
          金额
          <input
            value={amount}
            onChange={e => setAmount(e.target.value.replace(/[^\d.+\-*/×÷()\s]/g, ''))}
            inputMode="decimal"
            placeholder="0.00"
          />
        </label>

        <label>
          日期时间
          <input
            type="datetime-local"
            value={dateTime}
            onChange={e => setDateTime(e.target.value)}
          />
        </label>

        <label>
          备注
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="可选"
          />
        </label>

        <button className="primary" disabled={saving} onClick={save}>
          {saving ? '保存中…' : '确认转账'}
        </button>
      </div>
    </section>
  );
}

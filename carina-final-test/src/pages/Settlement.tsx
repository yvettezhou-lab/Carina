import './Settlement.css';
import { useEffect, useState } from 'react';
import { db } from '@/database/db';
import type { Account, Person, Transaction } from '@/models';
import { getPendingAdvances, settleAdvances } from '@/services/settlements';

export function Settlement() {
  const [people, setPeople] = useState<Person[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [advances, setAdvances] = useState<Transaction[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [accountId, setAccountId] = useState('');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [settlementDate, setSettlementDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      const [p, a] = await Promise.all([
        db.people.filter(x => !x.isArchived).sortBy('sortOrder'),
        db.accounts.filter(x => !x.isArchived).sortBy('sortOrder'),
      ]);
      setPeople(p);
      setAccounts(a);
      if (p[0]) setSelectedPersonId(p[0].id);
      if (a[0]) setAccountId(a[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!selectedPersonId) {
      setAdvances([]);
      setSelectedIds([]);
      return;
    }
    (async () => {
      const rows = await getPendingAdvances(selectedPersonId);
      setAdvances(rows);
      setSelectedIds([]);
      setMessage('');
    })();
  }, [selectedPersonId]);

  const selected = advances.filter(x => selectedIds.includes(x.id));
  const expectedAmount = selected.reduce((sum, x) => sum + x.amount, 0);
  const received = Number(receivedAmount);
  const difference = Number.isFinite(received) && receivedAmount !== '' ? received - expectedAmount : 0;

  const toggle = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSettle = async () => {
    if (!selectedPersonId) return setMessage('请选择人物');
    if (!selectedIds.length) return setMessage('至少选择一笔代付');
    if (!accountId) return setMessage('请选择收款账户');
    if (!Number.isFinite(received) || received < 0) return setMessage('请输入有效的收回金额');

    try {
      const [year, month, day] = settlementDate.split('-').map(Number);
      const dateTime = new Date(year, month - 1, day).getTime();
      await settleAdvances({
        personId: selectedPersonId,
        transactionIds: selectedIds,
        accountId,
        receivedAmount: received,
        dateTime,
      });
      setReceivedAmount('');
      setAdvances(await getPendingAdvances(selectedPersonId));
      setSelectedIds([]);
      setMessage('结算完成');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '结算失败');
    }
  };

  return (
    <section>
      <div className="settlement-intro">
        <strong>代付结算</strong>
        <p>选择一笔或多笔代付，输入实际收回金额和收款账户。</p>
      </div>

      <div className="settlement-form">
        <div className="settlement-section">
          <div className="settlement-section-label">人物</div>
          <div className="settlement-people">
            {people.map(person => (
              <button
                key={person.id}
                type="button"
                className={`settlement-person ${selectedPersonId === person.id ? 'selected' : ''}`}
                onClick={() => setSelectedPersonId(person.id)}
              >
                {person.name}
              </button>
            ))}
          </div>
        </div>

        <div className="settlement-section settlement-pending">
          <div className="settlement-section-title">
            <span>待结算代付</span>
            {selected.length > 0 && <small>{selected.length} selected · ¥{expectedAmount.toFixed(2)}</small>}
          </div>

          {advances.length === 0 ? (
            <div className="settlement-empty">暂无待结算代付。</div>
          ) : (
            <div className="settlement-pending-list">
              {advances.map(item => {
                const active = selectedIds.includes(item.id);
                return (
                  <label key={item.id} className={`settlement-item ${active ? 'selected' : ''}`}>
                    <input type="checkbox" checked={active} onChange={() => toggle(item.id)} />
                    <span className="settlement-item-main">
                      <strong>{item.description}</strong>
                      <small>{new Date(item.dateTime).toLocaleDateString('zh-CN')}</small>
                    </span>
                    <b>¥{item.amount.toFixed(2)}</b>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="settlement-section">
          <div className="settlement-section-title">收款信息</div>
          <div className="settlement-field-grid">
            <label className="settlement-field">
              <span>收款账户</span>
              <select value={accountId} onChange={e => setAccountId(e.target.value)}>
                <option value="">请选择账户</option>
                {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>

            <label className="settlement-field">
              <span>实际收回日期</span>
              <input type="date" value={settlementDate} onChange={e => setSettlementDate(e.target.value)} />
            </label>
          </div>

          <label className="settlement-field settlement-amount-field">
            <span>实际收回金额</span>
            <input
              inputMode="decimal"
              value={receivedAmount}
              onChange={e => setReceivedAmount(e.target.value.replace(/[^\d.+-]/g, ''))}
              placeholder="0.00"
            />
          </label>

          <div className="settlement-summary">
            <div><span>应收本金</span><b>¥{expectedAmount.toFixed(2)}</b></div>
            <div><span>实际收回</span><b>¥{Number.isFinite(received) && receivedAmount !== '' ? received.toFixed(2) : '0.00'}</b></div>
            <div className={difference >= 0 ? 'positive' : 'negative'}><span>差额</span><b>{difference >= 0 ? '+' : '−'}¥{Math.abs(difference).toFixed(2)}</b></div>
          </div>

          <button
            className="primary-button settlement-submit"
            type="button"
            onClick={handleSettle}
            disabled={!selectedIds.length || !accountId || receivedAmount === ''}
          >
            完成结算
          </button>

          {message && <div className="settlement-message">{message}</div>}
        </div>
      </div>
    </section>
  );
}

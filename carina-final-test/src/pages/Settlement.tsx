import './Settlement.css';
import { useEffect, useMemo, useState } from 'react';
import { db } from '@/database/db';
import type { Account, Person, Settlement as SettlementRecord, SettlementHistory, Transaction } from '@/models';
import { correctSettlement, getPendingAdvances, settleAdvances } from '@/services/settlements';

type HistoryStatus = 'all' | 'pending' | 'settled';

export function Settlement() {
  const [view, setView] = useState<'settle' | 'history'>('settle');
  const [people, setPeople] = useState<Person[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [advances, setAdvances] = useState<Transaction[]>([]);
  const [historyRows, setHistoryRows] = useState<Transaction[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [correctionHistory, setCorrectionHistory] = useState<SettlementHistory[]>([]);
  const [editingSettlementId, setEditingSettlementId] = useState('');
  const [correctionAccountId, setCorrectionAccountId] = useState('');
  const [correctionAmount, setCorrectionAmount] = useState('');
  const [correctionDate, setCorrectionDate] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionMessage, setCorrectionMessage] = useState('');
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
  const [historyPersonId, setHistoryPersonId] = useState('all');
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>('all');
  const [historyStart, setHistoryStart] = useState('');
  const [historyEnd, setHistoryEnd] = useState('');
  const [message, setMessage] = useState('');

  const refreshHistory = async () => {
    const [allTransactions, allSettlements, allCorrections] = await Promise.all([
      db.transactions.toArray(),
      db.settlements.toArray(),
      db.settlementHistory.toArray(),
    ]);
    setHistoryRows(allTransactions.filter(t => t.kind === 'advance').sort((a, b) => b.dateTime - a.dateTime));
    setSettlements(allSettlements.sort((a, b) => b.dateTime - a.dateTime));
    setCorrectionHistory(allCorrections.sort((a, b) => b.createdAt - a.createdAt));
  };

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
      await refreshHistory();
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

  const history = useMemo(() => {
    const start = historyStart ? new Date(`${historyStart}T00:00:00`).getTime() : -Infinity;
    const end = historyEnd ? new Date(`${historyEnd}T23:59:59.999`).getTime() : Infinity;
    return historyRows.filter(item => {
      if (historyPersonId !== 'all' && item.personId !== historyPersonId) return false;
      if (item.dateTime < start || item.dateTime > end) return false;
      if (historyStatus === 'pending' && item.advanceStatus === 'settled') return false;
      if (historyStatus === 'settled' && item.advanceStatus !== 'settled') return false;
      return true;
    });
  }, [historyRows, historyPersonId, historyStart, historyEnd, historyStatus]);

  const historyAdvanceTotal = history.reduce((sum, item) => sum + item.amount, 0);
  const historySettledTotal = history.filter(item => item.advanceStatus === 'settled').reduce((sum, item) => sum + item.amount, 0);
  const settlementById = useMemo(() => new Map<string, SettlementRecord>(settlements.map(s => [s.id, s] as const)), [settlements]);
  const peopleById = useMemo(() => new Map<string, string>(people.map(p => [p.id, p.name] as const)), [people]);
  const accountsById = useMemo(() => new Map<string, string>(accounts.map(a => [a.id, a.name] as const)), [accounts]);

  const handleCorrectAccount = async (settlement: SettlementRecord) => {
    if (!correctionAccountId) return setCorrectionMessage('请选择正确的收款账户');
    if (correctionAmount.trim() === '' || !Number.isFinite(Number(correctionAmount)) || Number(correctionAmount) < 0) return setCorrectionMessage('请输入有效的实际收回金额');
    if (!correctionDate) return setCorrectionMessage('请选择实际收回日期');
    try {
      const [year, month, day] = correctionDate.split('-').map(Number);
      const result = await correctSettlement({settlementId:settlement.id,newAccountId:correctionAccountId,receivedAmount:Number(correctionAmount),dateTime:new Date(year,month-1,day).getTime(),reason:correctionReason});
      if (!result.changed) { setCorrectionMessage('结算信息没有变化'); return; }
      await refreshHistory();
      setEditingSettlementId('');
      setCorrectionReason('');
      setCorrectionMessage('结算信息已更正，历史已保存');
    } catch (error) {
      setCorrectionMessage(error instanceof Error ? error.message : '更正失败');
    }
  };

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
      await refreshHistory();
      setMessage('结算完成');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '结算失败');
    }
  };

  return (
    <section>
      <div className="settlement-intro">
        <strong>代付结算</strong>
        <p>管理待收回代付，也可以回顾历史垫付金额与结算状态。</p>
      </div>

      <div className="settlement-tabs" role="tablist" aria-label="代收代付视图">
        <button type="button" role="tab" aria-selected={view === 'settle'} className={view === 'settle' ? 'active' : ''} onClick={() => setView('settle')}>待结算</button>
        <button type="button" role="tab" aria-selected={view === 'history'} className={view === 'history' ? 'active' : ''} onClick={() => { setView('history'); void refreshHistory(); }}>History 历史</button>
      </div>

      {view === 'settle' ? (
        <div className="settlement-form">
          <div className="settlement-section">
            <div className="settlement-section-label">人物</div>
            <div className="settlement-people">
              {people.map(person => (
                <button key={person.id} type="button" className={`settlement-person ${selectedPersonId === person.id ? 'selected' : ''}`} onClick={() => setSelectedPersonId(person.id)}>{person.name}</button>
              ))}
            </div>
          </div>

          <div className="settlement-section settlement-pending">
            <div className="settlement-section-title">
              <span>待结算代付</span>
              {selected.length > 0 && <small>{selected.length} selected · ¥{expectedAmount.toFixed(2)}</small>}
            </div>
            {advances.length === 0 ? <div className="settlement-empty">暂无待结算代付。</div> : (
              <div className="settlement-pending-list">
                {advances.map(item => {
                  const active = selectedIds.includes(item.id);
                  return (
                    <label key={item.id} className={`settlement-item ${active ? 'selected' : ''}`}>
                      <input type="checkbox" checked={active} onChange={() => toggle(item.id)} />
                      <span className="settlement-item-main"><strong>{item.description}</strong><small>{new Date(item.dateTime).toLocaleDateString('zh-CN')}</small></span>
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
              <label className="settlement-field"><span>收款账户</span><select value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">请选择账户</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
              <label className="settlement-field"><span>实际收回日期</span><input type="date" value={settlementDate} onChange={e => setSettlementDate(e.target.value)} /></label>
            </div>
            <label className="settlement-field settlement-amount-field"><span>实际收回金额</span><input inputMode="decimal" value={receivedAmount} onChange={e => setReceivedAmount(e.target.value.replace(/[^\d.+-]/g, ''))} placeholder="0.00" /></label>
            <div className="settlement-summary">
              <div><span>应收本金</span><b>¥{expectedAmount.toFixed(2)}</b></div>
              <div><span>实际收回</span><b>¥{Number.isFinite(received) && receivedAmount !== '' ? received.toFixed(2) : '0.00'}</b></div>
              <div className={difference >= 0 ? 'positive' : 'negative'}><span>差额</span><b>{difference >= 0 ? '+' : '−'}¥{Math.abs(difference).toFixed(2)}</b></div>
            </div>
            <button className="primary-button settlement-submit" type="button" onClick={handleSettle} disabled={!selectedIds.length || !accountId || receivedAmount === ''}>完成结算</button>
            {message && <div className="settlement-message">{message}</div>}
          </div>
        </div>
      ) : (
        <div className="settlement-history">
          <div className="settlement-history-totals">
            <div><span>筛选范围内累计代付</span><strong>¥{historyAdvanceTotal.toFixed(2)}</strong></div>
            <div><span>其中已结算本金</span><strong>¥{historySettledTotal.toFixed(2)}</strong></div>
            <div><span>尚未收回本金</span><strong>¥{(historyAdvanceTotal - historySettledTotal).toFixed(2)}</strong></div>
          </div>
          <div className="settlement-history-filters">
            <label className="settlement-field"><span>人物</span><select value={historyPersonId} onChange={e => setHistoryPersonId(e.target.value)}><option value="all">全部人物</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <label className="settlement-field"><span>状态</span><select value={historyStatus} onChange={e => setHistoryStatus(e.target.value as HistoryStatus)}><option value="all">全部状态</option><option value="pending">待收回</option><option value="settled">已结算</option></select></label>
            <label className="settlement-field"><span>开始日期</span><input type="date" value={historyStart} onChange={e => setHistoryStart(e.target.value)} /></label>
            <label className="settlement-field"><span>结束日期</span><input type="date" value={historyEnd} onChange={e => setHistoryEnd(e.target.value)} /></label>
          </div>
          {history.length === 0 ? <div className="settlement-empty">没有符合筛选条件的代付记录。</div> : (
            <div className="settlement-history-list">
              {history.map(item => {
                const settlement = item.settlementId ? settlementById.get(item.settlementId) : undefined;
                return (
                  <article className="settlement-history-item" key={item.id}>
                    <div className="settlement-history-item-top"><strong>{item.description || '代付'}</strong><b>¥{item.amount.toFixed(2)}</b></div>
                    <div className="settlement-history-meta"><span>{new Date(item.dateTime).toLocaleDateString('zh-CN')}</span><span>{peopleById.get(item.personId || '') || '未指定人物'}</span><span className={item.advanceStatus === 'settled' ? 'history-status settled' : 'history-status pending'}>{item.advanceStatus === 'settled' ? '已结算' : '待收回'}</span></div>
                    <div className="settlement-history-detail"><span>代付账户：{accountsById.get(item.accountId) || '账户已删除'}</span>{settlement && <span>收款账户：{accountsById.get(settlement.accountId) || '账户已删除'}</span>}</div>
                    {settlement && <div className="settlement-history-detail"><span>实际收回：¥{settlement.receivedAmount.toFixed(2)}</span><span>差额：{settlement.difference > 0 ? '+' : ''}¥{settlement.difference.toFixed(2)}</span></div>}
                    {settlement && <>
                      <button type="button" className="settlement-history-edit" onClick={() => { setEditingSettlementId(editingSettlementId === settlement.id ? '' : settlement.id); setCorrectionAccountId(settlement.accountId); setCorrectionAmount(String(settlement.receivedAmount)); setCorrectionDate(new Date(settlement.dateTime).toLocaleDateString('en-CA')); setCorrectionReason(''); setCorrectionMessage(''); }}>更正结算信息</button>
                      {editingSettlementId === settlement.id && <div className="settlement-correction-editor">
                        <label className="settlement-field"><span>正确的收款账户</span><select value={correctionAccountId} onChange={e => setCorrectionAccountId(e.target.value)}><option value="">请选择账户</option>{accounts.filter(a => !a.isArchived).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
                        <label className="settlement-field"><span>实际收回金额</span><input inputMode="decimal" value={correctionAmount} onChange={e => setCorrectionAmount(e.target.value.replace(/[^\\d.+-]/g, ''))} /></label>
                        <label className="settlement-field"><span>实际收回日期</span><input type="date" value={correctionDate} onChange={e => setCorrectionDate(e.target.value)} /></label>
                        <label className="settlement-field"><span>更正原因（可选）</span><input value={correctionReason} onChange={e => setCorrectionReason(e.target.value)} placeholder="例如：收款账户或金额记错" /></label>
                        <button type="button" className="primary-button settlement-correction-save" onClick={() => void handleCorrectAccount(settlement)}>确认更正</button>
                        {correctionMessage && <div className="settlement-message">{correctionMessage}</div>}
                      </div>}
                      {correctionHistory.filter(h => h.settlementId === settlement.id).map(h => <div className="settlement-history-audit" key={h.id}><strong>结算更正</strong><span>账户：{h.oldAccountName} → {h.newAccountName}</span><span>金额：¥{h.oldReceivedAmount.toFixed(2)} → ¥{h.newReceivedAmount.toFixed(2)}</span><small>{new Date(h.createdAt).toLocaleString('zh-CN')}{h.reason ? ` · ${h.reason}` : ''}</small></div>)}
                    </>}
                  </article>
                );
              })}
            </div>
          )}
          <div className="settlement-message">统计按原始代付记录计算；结算收款与差额不会重复计入代付总额。</div>
        </div>
      )}
    </section>
  );
}

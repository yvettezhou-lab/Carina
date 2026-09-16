import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '@/database/db';
import type { Account, Category, Person, Transaction, Flow } from '@/models';
import { evaluateAmountExpression } from '@/utils/amount';

const pad=(n:number)=>String(n).padStart(2,'0');
const dateKey=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const localDateTime=(timestamp:number)=>{const d=new Date(timestamp);return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;};
const useNativeDatePicker=()=>{if(typeof navigator==='undefined')return false;const ua=navigator.userAgent;const ios=/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/i.test(ua)&&navigator.maxTouchPoints>1);if(!ios)return false;const m=ua.match(/(?:OS|Version\/)(\d+)[._]/i);return m?Number(m[1])<17:false;};

function CustomDatePicker({value,onChange}:{value:string;onChange:(value:string)=>void}){
  const selected=new Date(`${value.slice(0,10)}T00:00:00`);const [open,setOpen]=useState(false);const [month,setMonth]=useState(new Date(selected.getFullYear(),selected.getMonth(),1));
  useEffect(()=>{if(open)setMonth(new Date(selected.getFullYear(),selected.getMonth(),1));},[value,open]);
  const firstWeekday=(month.getDay()+6)%7;const daysInMonth=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();const cells=Array.from({length:firstWeekday+daysInMonth},(_,i)=>i<firstWeekday?null:i-firstWeekday+1);const monthLabel=month.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  return <div className="date-picker-wrap custom-date-picker">
    <button type="button" className="date-picker-trigger" aria-label="Choose date" onClick={()=>{setMonth(new Date(selected.getFullYear(),selected.getMonth(),1));setOpen(v=>!v)}}><span>{selected.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span><CalendarDays size={16}/></button>
    {open&&<div className="date-picker-popover"><div className="date-picker-head"><button type="button" aria-label="Previous month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ChevronLeft size={16}/></button><strong>{monthLabel}</strong><button type="button" aria-label="Next month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><ChevronRight size={16}/></button></div><div className="date-weekdays">{['M','T','W','T','F','S','S'].map((d,i)=><span key={`${d}-${i}`}>{d}</span>)}</div><div className="date-grid">{cells.map((day,i)=>day===null?<span key={`blank-${i}`}/>:<button type="button" key={day} className={day===selected.getDate()&&month.getMonth()===selected.getMonth()&&month.getFullYear()===selected.getFullYear()?'selected':''} onClick={()=>{const next=`${month.getFullYear()}-${pad(month.getMonth()+1)}-${pad(day)}`;onChange(`${next}${value.slice(10)}`);setOpen(false)}}>{day}</button>)}</div></div>}
  </div>;
}

function NativeDatePicker({value,onChange}:{value:string;onChange:(value:string)=>void}){
  const date=value.slice(0,10);const display=new Date(`${date}T00:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  return <div className="date-picker-wrap native-date-picker"><span className="date-picker-display">{display}</span><CalendarDays size={16}/><input type="date" aria-label="Choose date" value={date} onChange={e=>{const next=e.currentTarget.value;if(next)onChange(`${next}${value.slice(10)}`)}}/></div>;
}
function HybridDatePicker({value,onChange}:{value:string;onChange:(value:string)=>void}){const[native]=useState(useNativeDatePicker);return native?<NativeDatePicker value={value} onChange={onChange}/>:<CustomDatePicker value={value} onChange={onChange}/>;}

export function EditTransaction() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tx,setTx]=useState<Transaction|null>(null);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [categories,setCategories]=useState<Category[]>([]);
  const [people,setPeople]=useState<Person[]>([]);
  const [description,setDescription]=useState('');
  const [amount,setAmount]=useState('');
  const [flow,setFlow]=useState<Flow>('expense');
  const [accountId,setAccountId]=useState('');
  const [categoryId,setCategoryId]=useState('');
  const [personId,setPersonId]=useState('');
  const [dateTime,setDateTime]=useState('');
  const [isAdvance,setIsAdvance]=useState(false);
  const [saving,setSaving]=useState(false);

  useEffect(()=>{(async()=>{
    if(!id) return;
    const [t,a,c,p]=await Promise.all([db.transactions.get(id),db.accounts.toArray(),db.categories.toArray(),db.people.toArray()]);
    if(!t) return;
    const visibleAccounts=a.filter(x=>!x.isArchived||x.id===t.accountId).sort((x,y)=>x.sortOrder-y.sortOrder);
    const visibleCategories=c.filter(x=>!x.isArchived||x.id===t.categoryId).sort((x,y)=>x.sortOrder-y.sortOrder);
    const visiblePeople=p.filter(x=>!x.isArchived||x.id===t.personId).sort((x,y)=>x.sortOrder-y.sortOrder);
    setTx(t);setDescription(t.description);setAmount(String(t.amount));setFlow(t.flow);setAccountId(t.accountId);setCategoryId(t.categoryId);setPersonId(t.personId??'');setDateTime(localDateTime(t.dateTime));setIsAdvance(t.kind==='advance');setAccounts(visibleAccounts);setCategories(visibleCategories);setPeople(visiblePeople);
  })()},[id]);

  function changeFlow(next:Flow){
    setFlow(next);
    const nextCat=categories.find(x=>x.flow===next&&!x.isArchived);
    if(nextCat)setCategoryId(nextCat.id);
  }

  async function save(){
    if(!tx||saving)return;
    const n=evaluateAmountExpression(amount);
    if(!description.trim()||!Number.isFinite(n)||n<=0||!accountId||!categoryId||!dateTime)return;
    setSaving(true);
    try{
      const update:any={description:description.trim(),amount:n,accountId,categoryId,personId:personId||undefined,flow,dateTime:new Date(dateTime).getTime(),updatedAt:Date.now()};
      if(flow==='expense'&&isAdvance){update.kind='advance';update.advanceStatus=tx.kind==='advance'&&tx.advanceStatus==='settled'?'settled':'pending';}
      else{update.kind='normal';update.advanceStatus=undefined;}
      await db.transactions.update(tx.id,update);
      navigate('/transactions',{replace:true});
    }finally{setSaving(false);}
  }

  if(!tx)return <section><header className="topbar"><button className="text-btn" onClick={()=>navigate(-1)}>返回</button><h1>编辑记录</h1></header><div className="empty">记录不存在</div></section>;
  const cats=categories.filter(x=>x.flow===flow);

  return <div className="quick-page"><header className="quick-header"><button className="icon-btn" onClick={()=>navigate(-1)}><ChevronLeft/></button><div className="quick-title"><h1>Edit</h1><span>EDIT RECORD</span></div></header><div className="quick-form">
    <div className="segmented"><button className={flow==='expense'?'active':''} onClick={()=>changeFlow('expense')}>支出</button><button className={flow==='income'?'active':''} onClick={()=>changeFlow('income')}>收入</button></div>
    <div className="quick-entry-meta edit-record-meta" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',alignItems:'start'}}><div className="quick-meta-field"><span>Date</span><HybridDatePicker value={dateTime} onChange={setDateTime}/></div><div className="quick-meta-field"><span>Time</span><input type="time" value={dateTime.slice(11,16)} onChange={e=>setDateTime(`${dateTime.slice(0,11)}${e.target.value}`)} style={{height:'44px',minHeight:'44px',appearance:'none',WebkitAppearance:'none',textAlign:'center',lineHeight:'1.2'}}/></div></div>
    <label>Description<input value={description} onChange={e=>setDescription(e.target.value)}/></label>
    <label>Amount<input value={amount} onChange={e=>setAmount(e.target.value.replace(/[^\d.+\-*/×÷()\s]/g,''))} inputMode="decimal"/></label>
    <div className="smart-grid"><label>Category<select value={categoryId} onChange={e=>setCategoryId(e.target.value)}>{cats.map(x=><option key={x.id} value={x.id}>{x.name}{x.isArchived?'（已归档）':''}</option>)}</select></label><label>Account<select value={accountId} onChange={e=>setAccountId(e.target.value)}>{accounts.map(x=><option key={x.id} value={x.id}>{x.name}{x.isArchived?'（已归档）':''}</option>)}</select></label><label>Person><div className="person-picker" style={{display:'flex',flexWrap:'wrap',gap:'8px'}}>{people.map(x=><button type="button" key={x.id} className={personId===x.id?'primary':'secondary'} style={{width:'max-content',minWidth:'0',flex:'0 0 auto'}} onClick={()=>setPersonId(personId===x.id?'':x.id)}>{x.name}</button>)}</div></label></div>
    {flow==='expense'&&<div className="quick-meta-field edit-advance-field"><span>Advance</span><label className="edit-advance-toggle"><input type="checkbox" checked={isAdvance} onChange={e=>setIsAdvance(e.currentTarget.checked)}/><span>{isAdvance?'代付':'普通支出'}</span></label></div>}
    <button className="primary" disabled={saving} onClick={save}>{saving?'保存中…':'保存修改'}</button>
  </div></div>;
}

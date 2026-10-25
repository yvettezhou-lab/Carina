import {db} from '@/database/db'; import {uid} from '@/utils/id'; import type {Flow} from '@/models'; export interface Suggestion{categoryId?:string;accountId?:string;personId?:string;profileId?:string}
export async function suggest(text:string,flow:Flow='expense'):Promise<Suggestion>{
 const q=text.trim().toLowerCase();if(!q)return{};
 const ps=await db.itemProfiles.toArray();
 const r=ps.filter(p=>!p.flow||p.flow===flow).map(p=>({p,score:(p.name.toLowerCase()===q?1000:p.name.toLowerCase().includes(q)||q.includes(p.name.toLowerCase())?500:0)+p.useCount})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
 const p=r[0]?.p;
 if(p?.categoryId)return{categoryId:p.categoryId,accountId:p.accountId,profileId:p.id};
 const categories=await db.categories.filter(c=>!c.isArchived&&c.flow===flow&&Boolean(c.matchKeywords?.length)).toArray();
 const matched=categories.map(c=>({c,score:(c.matchKeywords??[]).reduce((score,keyword)=>{const k=keyword.trim().toLowerCase();return k&&(q.includes(k))?score+Math.max(1,k.length):score},0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.c.sortOrder-b.c.sortOrder);
 return { ...(matched[0]?{categoryId:matched[0].c.id}:{}), ...(p?.accountId?{accountId:p.accountId}:{}), ...(p?.id?{profileId:p.id}:{}) };
}
export async function learnFromTransaction(t:{description:string;categoryId:string;accountId:string;personId?:string;amount:number;flow:Flow}){
 const ps=await db.itemProfiles.toArray();const f=ps.find(p=>p.name.trim().toLowerCase()===t.description.trim().toLowerCase());
 if(f)await db.itemProfiles.update(f.id,{categoryId:t.categoryId,accountId:t.accountId,personId:t.personId,amount:t.amount,flow:t.flow,useCount:f.useCount+1,lastUsedAt:Date.now()});
 else await db.itemProfiles.add({id:uid(),name:t.description.trim(),categoryId:t.categoryId,accountId:t.accountId,personId:t.personId,amount:t.amount,flow:t.flow,useCount:1,lastUsedAt:Date.now()});
}
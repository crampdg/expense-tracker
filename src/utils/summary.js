export function totalsByCategory(transactions){
return transactions.filter(t=>t.type==='expense').reduce((m,t)=>{ m[t.category]=(m[t.category]||0)+Number(t.amount||0); return m }, {})
}
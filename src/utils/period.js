export function calcPeriodEndDate(today, period){
const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
if(period.type==='Monthly'){
let end = new Date(t.getFullYear(), t.getMonth(), Math.min(period.day||4, 28))
if(t > end) end = new Date(t.getFullYear(), t.getMonth()+1, Math.min(period.day||4, 28))
return end
}
if(period.type==='Biweekly'){
// Anchor biweekly periods to 1 Jan 2025 (simple, deterministic)
const anchor = new Date(2025,0,1)
const ms14 = 14*24*60*60*1000
const diff = t - anchor
const mod = ((diff % ms14)+ms14)%ms14
const remaining = ms14 - mod
return new Date(t.getTime() + remaining)
}
// Annually
return new Date(t.getFullYear(), 11, 31)
}


export function daysUntil(from, to){
const a = new Date(from.getFullYear(), from.getMonth(), from.getDate())
const b = new Date(to.getFullYear(), to.getMonth(), to.getDate())
return Math.max(0, Math.ceil((b-a)/(24*60*60*1000)))
}
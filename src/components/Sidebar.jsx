import Button from './ui/Button.jsx'


export default function Sidebar({ active, setActive }){
const Item = ({id, label}) => (
<Button variant={active===id? 'primary':'ghost'} className="text-left" onClick={()=>setActive(id)}>
{label}
</Button>
)
return (
<aside className="w-40 md:w-56 bg-white shadow p-2 md:p-4 flex flex-col gap-2">
<Item id="wallet" label="Wallet" />
<Item id="budget" label="Budget" />
<Item id="summary" label="Summary" />
<Item id="detailed" label="Detailed" />
</aside>
)
}
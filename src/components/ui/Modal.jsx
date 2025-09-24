export default function Modal({ open, onClose, children, widthClass='w-11/12 max-w-md' }){
if(!open) return null
return (
<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3" onClick={onClose}>
<div className={`bg-white rounded-2xl shadow p-4 ${widthClass}`} onClick={e=>e.stopPropagation()}>
{children}
</div>
</div>
)
}
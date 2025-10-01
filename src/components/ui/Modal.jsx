export default function Modal({ open, onClose, children, widthClass='w-11/12 max-w-md', bodyClass='' }) {

  if (!open) return null

  const handleOverlayClick = (e) => {
    // Only close if user actually clicked the overlay, not inside
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3"
      onClick={handleOverlayClick}
      onTouchStart={handleOverlayClick}
    >
      <div className={`bg-white rounded-2xl shadow p-4 ${widthClass}`}>
        <div className={bodyClass}>
          {children}
        </div>
      </div>

    </div>
  )
}

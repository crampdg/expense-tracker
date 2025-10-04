import { useState } from "react"

export default function PeriodSettings({ periodConfig, setPeriodConfig }) {
  const [localType, setLocalType] = useState(periodConfig.type)
  const [localAnchor, setLocalAnchor] = useState(periodConfig.anchorDate)

  const handleSave = () => {
    setPeriodConfig({ type: localType, anchorDate: localAnchor })
  }

  return (
    <div className="p-4 border rounded-md bg-white shadow-md space-y-3 tap-safe">
      <h3 className="font-semibold">Budget Period Settings</h3>

      <label className="block">
        <span className="text-base">Cycle Type</span>
        <select
          className="border rounded w-full p-1 mt-1 text-base"
          value={localType}
          onChange={e => setLocalType(e.target.value)}
        >
          <option value="Weekly">Weekly</option>
          <option value="Biweekly">Biweekly</option>
          <option value="SemiMonthly">Semi-Monthly</option>
          <option value="Monthly">Monthly</option>
          <option value="Annual">Annual</option>
          <option value="Custom">Custom</option>
        </select>
      </label>

      <label className="block">
        <span className="text-base">Anchor Date</span>
        <input
          type="date"
          className="input text-base"
          value={localAnchor}
          onChange={e => setLocalAnchor(e.target.value)}
        />

      </label>

      <button
        className="tap-safe bg-blue-500 text-white px-4 py-2 rounded min-h-[44px] text-[16px] shadow-sm active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        onClick={handleSave}
      >
        Save Period Settings
      </button>

    </div>
  )
}

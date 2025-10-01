import Button from "./Button.jsx"
import { exportElementToPDF } from "../../utils/pdfExport.js"

export default function ExportPDFButton({ targetId, filename = "export.pdf" }) {
  return (
    <Button
      variant="ghost"
      onClick={() => exportElementToPDF(targetId, filename)}
    >
      💾 Export PDF
    </Button>
  )
}

import Button from "./Button.jsx";

export default function ExportPDFButton({ targetId, filename = "export.pdf" }) {
  const onClick = async () => {
    const { exportElementToPDF } = await import("../../utils/pdfExport.js");
    await exportElementToPDF(targetId, filename);
  };

  return (
    <Button variant="ghost" onClick={onClick}>
      💾 Export PDF
    </Button>
  );
}

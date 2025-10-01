import Button from "./Button.jsx";

export default function SharePDFButton({ targetId, filename = "export.pdf" }) {
  const onClick = async () => {
    const { shareOrDownloadPDF } = await import("../../utils/pdfExport.js");
    await shareOrDownloadPDF(targetId, filename);
  };

  return (
    <Button variant="ghost" onClick={onClick}>
      📤 Share PDF
    </Button>
  );
}

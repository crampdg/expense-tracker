import jsPDF from "jspdf";
import html2canvas from "html2canvas";

async function generatePDFBlob(elementId) {
  const input = document.getElementById(elementId);
  if (!input) return null;

  const canvas = await html2canvas(input, { scale: 2 });
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);

  const imgWidth = canvas.width * ratio;
  const imgHeight = canvas.height * ratio;

  pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);

  return pdf;
}

export async function exportElementToPDF(elementId, filename = "export.pdf") {
  const pdf = await generatePDFBlob(elementId);
  if (!pdf) return;
  pdf.save(filename);
}

export async function shareOrDownloadPDF(elementId, filename = "export.pdf") {
  const pdf = await generatePDFBlob(elementId);
  if (!pdf) return;

  const blob = pdf.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });

  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: filename,
        files: [file],
      });
    } catch (err) {
      console.warn("Share canceled or failed:", err);
    }
  } else {
    pdf.save(filename); // fallback to download
  }
}

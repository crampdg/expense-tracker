// src/utils/pdfExport.js
async function getLibs() {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  return { jsPDF, html2canvas };
}

async function generatePDF(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return null;

  const { jsPDF, html2canvas } = await getLibs();
  const canvas = await html2canvas(el, { scale: 2 });
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
  const pdf = await generatePDF(elementId);
  if (!pdf) return;
  pdf.save(filename);
}

export async function shareOrDownloadPDF(elementId, filename = "export.pdf") {
  const pdf = await generatePDF(elementId);
  if (!pdf) return;

  const blob = pdf.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });

  if (
    typeof navigator !== "undefined" &&
    navigator.share &&
    navigator.canShare &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ title: filename, files: [file] });
      return;
    } catch (e) {
      // fall through to download
      console.warn("Share canceled/failed:", e);
    }
  }
  pdf.save(filename);
}

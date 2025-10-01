// src/utils/pdfExport.js

// Lazy-load the heavy libs only when needed (prevents render-time crashes)
async function getLibs() {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  return { jsPDF, html2canvas };
}

// Core generator: captures a DOM element by id and returns a jsPDF instance
async function generatePDF(elementId) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    console.warn("PDF generation skipped: no DOM available.");
    return null;
  }

  const el = document.getElementById(elementId);
  if (!el) {
    alert(`Could not find #${elementId} on the page.`);
    return null;
  }

  const { jsPDF, html2canvas } = await getLibs();

  // Render the element to canvas
  const canvas = await html2canvas(el, {
    scale: 2,                // sharper output
    backgroundColor: "#ffffff", // ensure white background (not transparent)
    useCORS: true,           // allow CORS images if properly configured
    logging: false,
  });

  const imgData = canvas.toDataURL("image/png");

  // Create A4 portrait PDF in mm
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Fit the entire capture on one page (simple/robust). For pagination later, we can slice the canvas.
  const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
  const imgWidth = canvas.width * ratio;
  const imgHeight = canvas.height * ratio;

  pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
  return pdf;
}

/**
 * Exports the given element to a single-page PDF and downloads it.
 * @param {string} elementId - DOM id to capture
 * @param {string} filename  - Desired filename (e.g., "2025-09-01_to_2025-09-30_Summary.pdf")
 */
export async function exportElementToPDF(elementId, filename = "export.pdf") {
  const pdf = await generatePDF(elementId);
  if (!pdf) return;
  pdf.save(filename);
}

/**
 * Shares the PDF via the Web Share API when available; falls back to download.
 * @param {string} elementId - DOM id to capture
 * @param {string} filename  - Desired filename
 */
export async function shareOrDownloadPDF(elementId, filename = "export.pdf") {
  const pdf = await generatePDF(elementId);
  if (!pdf) return;

  const blob = pdf.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });

  const canNativeShare =
    typeof navigator !== "undefined" &&
    navigator.share &&
    navigator.canShare &&
    navigator.canShare({ files: [file] });

  if (canNativeShare) {
    try {
      await navigator.share({ title: filename, files: [file] });
      return;
    } catch (e) {
      console.warn("Share canceled or failed; falling back to download.", e);
    }
  }

  // Fallback: download
  pdf.save(filename);
}

import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { vscodeBridge } from '../vscodeApi';

export async function generateAndExportPdf(
  printableContainer: HTMLElement,
  fileName: string
): Promise<void> {
  const suggestedFileName =
    fileName.replace(/\.(arch\.md|arch|md)$/i, '') + '.pdf';

  printableContainer.classList.add('arch-pdf-export-mode');

  try {
    // Laisse un court instant au DOM pour appliquer la mise en page de publication
    await new Promise((r) => setTimeout(r, 120));

    const filter = (node: HTMLElement) => {
      if (node.classList && node.classList.contains('no-print')) {
        return false;
      }
      return true;
    };

    const dataUrl = await toPng(printableContainer, {
      quality: 0.98,
      pixelRatio: 2,
      backgroundColor: '#FFFFFF',
      filter: filter as (node: Node) => boolean,
    });

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(e);
      img.src = dataUrl;
    });

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;

    const imgPropsWidth = img.width;
    const imgPropsHeight = img.height;
    const renderedHeightMm = (imgPropsHeight * usableWidth) / imgPropsWidth;

    let heightLeft = renderedHeightMm;
    let position = margin;

    pdf.addImage(
      dataUrl,
      'PNG',
      margin,
      position,
      usableWidth,
      renderedHeightMm,
      undefined,
      'FAST'
    );
    heightLeft -= usableHeight;

    while (heightLeft > 2) {
      position = heightLeft - renderedHeightMm + margin;
      pdf.addPage();
      pdf.addImage(
        dataUrl,
        'PNG',
        margin,
        position,
        usableWidth,
        renderedHeightMm,
        undefined,
        'FAST'
      );
      heightLeft -= usableHeight;
    }

    const pdfBase64 = pdf.output('datauristring');

    const printableHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>${suggestedFileName}</title>
  <style>
    body { margin: 0; padding: 20px; font-family: system-ui, sans-serif; background: #fff; }
    img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
  </style>
</head>
<body>
  <img src="${dataUrl}" alt="Architecture Document" />
</body>
</html>`;

    if (vscodeBridge.isVsCodeEnvironment()) {
      vscodeBridge.postMessage({
        type: 'savePdfPayload',
        pdfBase64,
        printableHtml,
        suggestedFileName,
      });
    } else {
      pdf.save(suggestedFileName);
    }
  } finally {
    printableContainer.classList.remove('arch-pdf-export-mode');
  }
}

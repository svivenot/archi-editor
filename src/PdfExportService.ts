import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Détecte un navigateur basé sur Chromium sur le système (macOS, Linux, Windows)
 * pour générer un PDF 100% vectoriel à partir du HTML/SVG nettoyé.
 */
export function findSystemChromiumExecutable(): string | undefined {
  const candidates: string[] = [];

  if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    );
  } else if (process.platform === 'win32') {
    const programFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files';
    const programFilesX86 =
      process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    candidates.push(
      path.join(programFiles, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(programFilesX86, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(programFiles, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(programFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe')
    );
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge'
    );
  }

  for (const bin of candidates) {
    if (fs.existsSync(bin)) {
      return bin;
    }
  }
  return undefined;
}

/**
 * Exporte le document en PDF sur le disque :
 * 1. Si un buffer PDF (pdfBase64) a été généré en haute résolution par la Webview
 *    (contenant le rendu exact du canevas React Flow et des SVG), on peut soit l'écrire
 *    directement, soit utiliser Chromium headless si printableHtml est préféré.
 * 2. Par défaut, si pdfBase64 est fourni et non vide, ou si Chromium headless réussit,
 *    garantit qu'un fichier PDF valide est écrit sur targetPdfPath.
 */
export async function exportDocumentToPdfFile(options: {
  targetPdfPath: string;
  pdfBase64?: string;
  printableHtml?: string;
}): Promise<{ method: 'webview-pdf' | 'chromium-vector'; filePath: string }> {
  const { targetPdfPath, pdfBase64, printableHtml } = options;

  // Priorité 1 : si pdfBase64 est fourni par la Webview (qui capture fidèlement les canevas
  // React Flow + SVG + styles embarqués), on l'utilise directement s'il est valide, ou
  // en combinaison avec Chromium si uniquement printableHtml est disponible.
  if (pdfBase64 && pdfBase64.length > 100) {
    const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;filename=generated\.pdf;base64,|^data:application\/pdf;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    fs.writeFileSync(targetPdfPath, buffer);
    return { method: 'webview-pdf', filePath: targetPdfPath };
  }

  if (printableHtml) {
    const browserBin = findSystemChromiumExecutable();
    if (browserBin) {
      const tmpHtmlPath = path.join(
        os.tmpdir(),
        `arch-export-${Date.now()}.html`
      );
      try {
        fs.writeFileSync(tmpHtmlPath, printableHtml, 'utf-8');
        await execFileAsync(browserBin, [
          '--headless',
          '--disable-gpu',
          '--no-pdf-header-footer',
          '--print-to-pdf-no-header',
          `--print-to-pdf=${targetPdfPath}`,
          `file://${tmpHtmlPath}`,
        ]);
        if (fs.existsSync(targetPdfPath)) {
          return { method: 'chromium-vector', filePath: targetPdfPath };
        }
      } finally {
        if (fs.existsSync(tmpHtmlPath)) {
          try {
            fs.unlinkSync(tmpHtmlPath);
          } catch {
            // ignore cleanup error
          }
        }
      }
    }
  }

  throw new Error(
    "Impossible de générer le PDF : aucune donnée PDF reçue et aucun navigateur Chromium détecté."
  );
}

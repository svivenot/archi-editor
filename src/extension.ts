import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  ArchEditorProvider,
  createSampleArchDocumentContent,
} from './ArchEditorProvider';
import { ComponentLibraryService } from './ComponentLibraryService';

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const libraryService = new ComponentLibraryService(workspaceRoot);

  const provider = new ArchEditorProvider(context, libraryService);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      ArchEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  );

  // Surveillance automatique des fichiers arch-components.yaml du workspace
  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/arch-components.{yaml,yml}'
  );
  watcher.onDidCreate(() => libraryService.reload());
  watcher.onDidChange(() => libraryService.reload());
  watcher.onDidDelete(() => libraryService.reload());
  context.subscriptions.push(watcher);

  // Commande : Nouveau Document d'Architecture (.arch.md)
  context.subscriptions.push(
    vscode.commands.registerCommand('archiEditor.newDocument', async () => {
      const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const defaultUri = folder
        ? vscode.Uri.file(path.join(folder, 'architecture.arch.md'))
        : undefined;

      const targetUri = await vscode.window.showSaveDialog({
        defaultUri,
        filters: { 'Architecture Markdown': ['arch.md', 'arch'] },
        saveLabel: 'Créer le document',
      });

      if (!targetUri) {
        return;
      }

      fs.writeFileSync(
        targetUri.fsPath,
        createSampleArchDocumentContent(),
        'utf-8'
      );
      await vscode.commands.executeCommand(
        'vscode.openWith',
        targetUri,
        ArchEditorProvider.viewType
      );
    })
  );

  // Commande : Exporter en PDF
  context.subscriptions.push(
    vscode.commands.registerCommand('archiEditor.exportPdf', () => {
      provider.requestPdfExportOnActiveEditor();
    })
  );

  // Commande : Initialiser arch-components.yaml dans le Workspace
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'archiEditor.initComponentLibrary',
      async () => {
        const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!folder) {
          vscode.window.showWarningMessage(
            'Ouvrez un dossier (Workspace) dans VS Code pour générer arch-components.yaml.'
          );
          return;
        }
        const targetPath = path.join(folder, 'arch-components.yaml');
        if (!fs.existsSync(targetPath)) {
          const templatePath = path.join(
            context.extensionPath,
            'resources',
            'default-components.yaml'
          );
          const content = fs.existsSync(templatePath)
            ? fs.readFileSync(templatePath, 'utf-8')
            : `# Catalogue de composants personnalisés\nversion: "1.0"\ncategories: []\ncomponents: []\n`;
          fs.writeFileSync(targetPath, content, 'utf-8');
          libraryService.reload();
        }
        const doc = await vscode.workspace.openTextDocument(targetPath);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      }
    )
  );

  // Commande : Ouvrir le texte brut à côté
  context.subscriptions.push(
    vscode.commands.registerCommand('archiEditor.openAsText', async () => {
      const active = provider.getActiveEditor();
      if (active) {
        await vscode.commands.executeCommand(
          'vscode.openWith',
          active.document.uri,
          'default',
          vscode.ViewColumn.Beside
        );
      }
    })
  );
}

export function deactivate(): void {}

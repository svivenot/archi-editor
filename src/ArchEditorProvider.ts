import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { ComponentLibraryService } from './ComponentLibraryService';
import { exportDocumentToPdfFile } from './PdfExportService';
import {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
} from './shared/archTypes';

export class ArchEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'archiEditor.archDocument';

  private activePanels = new Map<
    string,
    { panel: vscode.WebviewPanel; document: vscode.TextDocument }
  >();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly libraryService: ComponentLibraryService
  ) {}

  public getActiveEditor():
    | { panel: vscode.WebviewPanel; document: vscode.TextDocument }
    | undefined {
    for (const entry of this.activePanels.values()) {
      if (entry.panel.active) {
        return entry;
      }
    }
    const first = this.activePanels.values().next();
    return first.done ? undefined : first.value;
  }

  public requestPdfExportOnActiveEditor(): void {
    const active = this.getActiveEditor();
    if (!active) {
      vscode.window.showWarningMessage(
        "Aucun document d'architecture (.arch.md) n'est actuellement actif."
      );
      return;
    }
    const msg: ExtensionToWebviewMessage = { type: 'triggerPdfExport' };
    active.panel.webview.postMessage(msg);
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const docKey = document.uri.toString();
    this.activePanels.set(docKey, { panel: webviewPanel, document });

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
        vscode.Uri.joinPath(this.context.extensionUri, 'resources'),
      ],
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    let lastWebviewText = document.getText();
    // File d'écriture : on ne conserve que le dernier texte à appliquer et on
    // sérialise les WorkspaceEdit pour éviter les éditions concurrentes à plage
    // périmée (qui corrompaient le document pendant un drag → schéma vidé).
    let pendingWebviewText: string | null = null;
    let isFlushingEdits = false;

    const flushWebviewEdits = async () => {
      if (isFlushingEdits) {
        return;
      }
      isFlushingEdits = true;
      try {
        while (pendingWebviewText !== null) {
          const nextText = pendingWebviewText;
          pendingWebviewText = null;
          if (nextText === document.getText()) {
            continue;
          }
          lastWebviewText = nextText;
          const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
          );
          const edit = new vscode.WorkspaceEdit();
          edit.replace(document.uri, fullRange, nextText);
          await vscode.workspace.applyEdit(edit);
        }
      } finally {
        isFlushingEdits = false;
      }
    };

    const postMessage = (message: ExtensionToWebviewMessage) => {
      webviewPanel.webview.postMessage(message);
    };

    const unsubscribeLibrary = this.libraryService.onDidChange((library) => {
      postMessage({ type: 'libraryUpdated', library });
    });

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.uri.toString() !== docKey) {
          return;
        }
        // Ignore les changements provoqués par nos propres écritures (drag, édition webview)
        if (isFlushingEdits) {
          return;
        }
        const currentText = e.document.getText();
        if (currentText !== lastWebviewText) {
          lastWebviewText = currentText;
          postMessage({
            type: 'externalDocumentChange',
            documentText: currentText,
          });
        }
      }
    );

    webviewPanel.onDidDispose(() => {
      this.activePanels.delete(docKey);
      changeDocumentSubscription.dispose();
      unsubscribeLibrary();
    });

    webviewPanel.webview.onDidReceiveMessage(
      async (message: WebviewToExtensionMessage) => {
        switch (message.type) {
          case 'ready': {
            postMessage({
              type: 'init',
              documentText: document.getText(),
              fileName: path.basename(document.uri.fsPath),
              library: this.libraryService.getLibrary(),
            });
            break;
          }

          case 'updateDocument': {
            // Coalesce les rafales (ex: drag) : seul le dernier texte est appliqué,
            // les éditions sont sérialisées par flushWebviewEdits.
            pendingWebviewText = message.documentText;
            void flushWebviewEdits();
            break;
          }

          case 'openAsText': {
            await vscode.commands.executeCommand(
              'vscode.openWith',
              document.uri,
              'default',
              vscode.ViewColumn.Beside
            );
            break;
          }

          case 'initWorkspaceLibrary': {
            await vscode.commands.executeCommand(
              'archiEditor.initComponentLibrary'
            );
            break;
          }

          case 'savePdfPayload': {
            const defaultDir = path.dirname(document.uri.fsPath);
            const baseName = path
              .basename(document.uri.fsPath)
              .replace(/\.(arch\.md|arch|md)$/i, '');
            const defaultUri = vscode.Uri.file(
              path.join(defaultDir, `${baseName}.pdf`)
            );

            const saveUri = await vscode.window.showSaveDialog({
              defaultUri,
              filters: { 'Document PDF': ['pdf'] },
              saveLabel: 'Exporter en PDF',
            });

            if (!saveUri) {
              return;
            }

            try {
              await exportDocumentToPdfFile({
                targetPdfPath: saveUri.fsPath,
                pdfBase64: message.pdfBase64,
                printableHtml: message.printableHtml,
              });

              const action = await vscode.window.showInformationMessage(
                `PDF généré avec succès : ${path.basename(saveUri.fsPath)}`,
                'Ouvrir le PDF'
              );
              if (action === 'Ouvrir le PDF') {
                await vscode.env.openExternal(saveUri);
              }
            } catch (err: any) {
              vscode.window.showErrorMessage(
                `Erreur lors de l'export PDF : ${err?.message || err}`
              );
            }
            break;
          }
        }
      }
    );
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'dist',
        'webview',
        'webview.js'
      )
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'dist',
        'webview',
        'webview.css'
      )
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} data: blob: https:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource} data:; script-src 'nonce-${nonce}' ${webview.cspSource} 'unsafe-eval';"
    />
    <link href="${styleUri}" rel="stylesheet" />
    <title>Archi WYSIWYG Editor</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function createSampleArchDocumentContent(): string {
  return `# Dossier d'Architecture : Plateforme E-Commerce Hybride

Ce document présente l'architecture cible du système de prise de commandes et d'authentification centralisée, mêlant des briques Cloud (**AWS** / **Azure**) et nos composants d'infrastructure (**Traefik**, **Keycloak**, **RabbitMQ**, **PostgreSQL**, **MS SQL Server**, **Oracle**).

## 1. Vue d'Architecture Applicative et Infrastructure

Le schéma ci-dessous illustre le routage entrant via **Traefik**, la fédération d'identité **Keycloak**, le découplage événementiel **RabbitMQ** et la persistance polyglotte.

\`\`\`arch-box
title: Architecture Cible - Routage, IAM, Messaging et Bases de Données
nodes:
  - id: vpc-main
    componentRef: aws-vpc
    label: AWS VPC Production (eu-west-1)
    position:
      x: 40
      y: 40
    width: 820
    height: 450
    props:
      cidr: 10.20.0.0/16
  - id: proxy-traefik
    componentRef: traefik
    label: Traefik Ingress Proxy
    position:
      x: 80
      y: 200
    props:
      tls: mTLS + Let's Encrypt
      entrypoints: "443"
  - id: iam-keycloak
    componentRef: keycloak
    label: Keycloak SSO / OIDC
    position:
      x: 340
      y: 80
    props:
      realm: enterprise-sso
  - id: api-orders
    componentRef: aws-eks
    label: Order Service (EKS)
    position:
      x: 340
      y: 220
    props:
      k8s: "1.30"
  - id: broker-rmq
    componentRef: rabbitmq
    label: RabbitMQ Event Bus
    position:
      x: 340
      y: 360
    props:
      exchange: orders.topic
  - id: db-postgres
    componentRef: postgresql
    label: PostgreSQL Orders DB
    position:
      x: 630
      y: 160
    props:
      version: "16"
      ha: Primary + Replica
  - id: db-mssql
    componentRef: mssql
    label: MS SQL Server Billing
    position:
      x: 920
      y: 120
    props:
      edition: Enterprise
  - id: db-oracle
    componentRef: oracle
    label: Oracle ERP Core
    position:
      x: 920
      y: 310
    props:
      service: ERPPROD
edges:
  - id: e-auth
    source: proxy-traefik
    target: iam-keycloak
    label: ForwardAuth JWT
    protocol: OIDC / HTTPS
  - id: e-route
    source: proxy-traefik
    target: api-orders
    label: Route /api/v1/orders
    protocol: gRPC / HTTP2
  - id: e-pg
    source: api-orders
    target: db-postgres
    label: Transactionnelle
    protocol: TCP/5432
  - id: e-rmq
    source: api-orders
    target: broker-rmq
    label: Publish OrderPlaced
    protocol: AMQP
    style: dashed
    animated: true
  - id: e-mssql
    source: broker-rmq
    target: db-mssql
    label: Facturation
    protocol: TDS/1433
    style: dashed
  - id: e-oracle
    source: broker-rmq
    target: db-oracle
    label: Sync Stock ERP
    protocol: SQL*Net/1521
    style: dashed
\`\`\`

## 2. Diagramme de Séquence : Création et Synchronisation d'une Commande

Ce diagramme détaille les échanges synchrones et asynchrones lors de la validation d'un panier client.

\`\`\`arch-seq
title: Flux d'Authentification Keycloak et Traitement Asynchrone RabbitMQ
participants:
  - id: spa
    label: Portail Client Web
    componentRef: web-app
  - id: traefik
    label: Traefik Proxy
    componentRef: traefik
  - id: keycloak
    label: Keycloak IAM
    componentRef: keycloak
  - id: orders
    label: Service Commandes
    componentRef: aws-eks
  - id: pg
    label: PostgreSQL
    componentRef: postgresql
  - id: rmq
    label: RabbitMQ
    componentRef: rabbitmq
  - id: oracle
    label: Oracle ERP
    componentRef: oracle
items:
  - id: seq-1
    type: message
    from: spa
    to: traefik
    label: POST /orders (Bearer Token)
    protocol: HTTPS
    kind: sync
  - id: seq-2
    type: message
    from: traefik
    to: keycloak
    label: Vérification du jeton OIDC
    protocol: HTTPS
    kind: sync
  - id: seq-3
    type: message
    from: keycloak
    to: traefik
    label: 200 OK (Claims Utilisateur)
    kind: reply
  - id: seq-4
    type: message
    from: traefik
    to: orders
    label: Forward POST /orders
    protocol: HTTP/2
    kind: sync
  - id: seq-5
    type: message
    from: orders
    to: pg
    label: INSERT INTO orders (status = PENDING)
    protocol: SQL/5432
    kind: sync
  - id: seq-6
    type: block
    blockKind: par
    label: Diffusion asynchrone vers Facturation & ERP
  - id: seq-7
    type: message
    from: orders
    to: rmq
    label: Publish OrderCreatedEvent
    protocol: AMQP
    kind: async
  - id: seq-8
    type: message
    from: rmq
    to: oracle
    label: Réservation stock ERP
    protocol: SQL*Net
    kind: async
  - id: seq-9
    type: message
    from: orders
    to: spa
    label: 201 Created (Order ID)
    protocol: HTTPS
    kind: reply
\`\`\`
`;
}

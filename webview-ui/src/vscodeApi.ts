import { WebviewToExtensionMessage } from '@shared/archTypes';

interface VsCodeApi {
  postMessage(message: WebviewToExtensionMessage): void;
  getState(): any;
  setState(state: any): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

class VsCodeBridge {
  private readonly api: VsCodeApi | null;

  constructor() {
    if (typeof acquireVsCodeApi === 'function') {
      this.api = acquireVsCodeApi();
    } else {
      this.api = null;
    }
  }

  public isVsCodeEnvironment(): boolean {
    return this.api !== null;
  }

  public postMessage(message: WebviewToExtensionMessage): void {
    if (this.api) {
      this.api.postMessage(message);
    } else {
      // Mode autonome (navigateur / prévisualisation)
      console.debug('[Standalone Bridge] postMessage:', message.type);
    }
  }
}

export const vscodeBridge = new VsCodeBridge();

import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';
import {
  ComponentCategory,
  ComponentDefinition,
  ComponentLibrary,
} from './shared/archTypes';
import { DEFAULT_COMPONENT_LIBRARY } from './shared/defaultLibrary';

/**
 * Fusionne une bibliothèque de base avec le contenu YAML d'un fichier arch-components.yaml.
 * Fonction pure testable unitairement hors de l'hôte VS Code.
 */
export function mergeComponentLibraries(
  base: ComponentLibrary,
  customYamlText: string
): ComponentLibrary {
  try {
    const parsed = YAML.parse(customYamlText);
    if (!parsed || typeof parsed !== 'object') {
      return base;
    }

    const categoryMap = new Map<string, ComponentCategory>();
    for (const cat of base.categories) {
      categoryMap.set(cat.id, { ...cat });
    }
    if (Array.isArray(parsed.categories)) {
      for (const c of parsed.categories) {
        if (c && c.id && c.label) {
          categoryMap.set(String(c.id), {
            id: String(c.id),
            label: String(c.label),
            badgeColor: c.badgeColor ? String(c.badgeColor) : '#10B981',
          });
        }
      }
    }

    const componentMap = new Map<string, ComponentDefinition>();
    for (const comp of base.components) {
      componentMap.set(comp.id, { ...comp });
    }
    if (Array.isArray(parsed.components)) {
      for (const comp of parsed.components) {
        if (comp && comp.id && comp.name) {
          const id = String(comp.id);
          const existing = componentMap.get(id);
          componentMap.set(id, {
            id,
            name: String(comp.name),
            category: String(comp.category || existing?.category || 'generic'),
            symbol: String(comp.symbol || comp.icon || existing?.symbol || id),
            color: String(comp.color || existing?.color || '#3B82F6'),
            shape: comp.shape || existing?.shape || 'rounded-rect',
            isContainer:
              comp.isContainer !== undefined
                ? Boolean(comp.isContainer)
                : Boolean(existing?.isContainer),
            defaultTech: comp.defaultTech
              ? String(comp.defaultTech)
              : existing?.defaultTech,
            defaultProps:
              comp.defaultProps && typeof comp.defaultProps === 'object'
                ? comp.defaultProps
                : existing?.defaultProps,
            description: comp.description
              ? String(comp.description)
              : existing?.description,
          });
        }
      }
    }

    return {
      version: String(parsed.version || base.version),
      categories: Array.from(categoryMap.values()),
      components: Array.from(componentMap.values()),
    };
  } catch {
    return base;
  }
}

export class ComponentLibraryService {
  private currentLibrary: ComponentLibrary = DEFAULT_COMPONENT_LIBRARY;
  private listeners: Array<(lib: ComponentLibrary) => void> = [];

  constructor(private readonly workspaceRoot?: string) {
    this.reload();
  }

  public getLibrary(): ComponentLibrary {
    return this.currentLibrary;
  }

  public onDidChange(listener: (lib: ComponentLibrary) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public reload(): ComponentLibrary {
    let merged: ComponentLibrary = {
      version: DEFAULT_COMPONENT_LIBRARY.version,
      categories: [...DEFAULT_COMPONENT_LIBRARY.categories],
      components: [...DEFAULT_COMPONENT_LIBRARY.components],
    };

    if (this.workspaceRoot) {
      const candidatePaths = [
        path.join(this.workspaceRoot, 'arch-components.yaml'),
        path.join(this.workspaceRoot, 'arch-components.yml'),
        path.join(this.workspaceRoot, '.arch', 'components.yaml'),
      ];

      for (const candidate of candidatePaths) {
        if (fs.existsSync(candidate)) {
          try {
            const raw = fs.readFileSync(candidate, 'utf-8');
            merged = mergeComponentLibraries(merged, raw);
          } catch {
            // Ignore read error and keep default library
          }
        }
      }
    }

    this.currentLibrary = merged;
    for (const listener of this.listeners) {
      listener(this.currentLibrary);
    }
    return this.currentLibrary;
  }
}

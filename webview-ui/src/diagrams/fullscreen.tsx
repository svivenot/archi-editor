import React, { useEffect, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

/**
 * État « plein écran » d'un éditeur de diagramme. La touche Échap quitte le plein écran.
 */
export function useFullscreen(): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  return [fullscreen, setFullscreen];
}

/** Bouton d'activation du plein écran pour la barre d'en-tête d'un diagramme. */
export const FullscreenButton: React.FC<{
  fullscreen: boolean;
  onToggle: () => void;
}> = ({ fullscreen, onToggle }) => (
  <button
    type="button"
    className={`arch-btn-secondary${fullscreen ? ' active' : ''}`}
    onClick={onToggle}
    title={fullscreen ? 'Quitter le plein écran (Échap)' : 'Éditer le schéma en plein écran'}
  >
    {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
    <span>{fullscreen ? 'Réduire' : 'Plein écran'}</span>
  </button>
);

import { useEffect } from 'react';
import { isSoundEnabled, prefersReducedMotion, playInteractionCue } from '../lib/feedback';
import { prepareAudio } from '../lib/audio-context';

/** Fast, non-blocking feedback for mouse, touch and keyboard activation. */
export function InteractionFeedback() {
  useEffect(() => {
    const prepare = () => { if (isSoundEnabled()) prepareAudio(); };
    const clicked = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>('button, a[href], [role="button"], [role="checkbox"], [role="switch"], [role="tab"]') : null;
      if (!target || target.matches(':disabled, [aria-disabled="true"]') || target.closest('.adsbygoogle, [data-native-ad-placement], [data-testid="inline-ad"], [data-feedback="off"]')) return;
      if (!prefersReducedMotion()) {
        target.getAnimations().filter(animation => animation.id === 'casparel-press').forEach(animation => animation.cancel());
        const animation = target.animate([
          { scale: '0.97', boxShadow: '0 0 0 0 hsl(var(--primary) / 0.30)' },
          { scale: '1.015', boxShadow: '0 0 0 5px hsl(var(--primary) / 0.12)', offset: 0.45 },
          { scale: '1', boxShadow: '0 0 0 7px hsl(var(--primary) / 0)' },
        ], { duration: 180, easing: 'ease-out' });
        animation.id = 'casparel-press';
      }
      // A page can supply a richer result cue; this small tick never delays
      // the click handler or substitutes for success/failure confirmation.
      playInteractionCue();
    };
    document.addEventListener('pointerdown', prepare, true);
    document.addEventListener('keydown', prepare, true);
    document.addEventListener('click', clicked);
    return () => {
      document.removeEventListener('pointerdown', prepare, true);
      document.removeEventListener('keydown', prepare, true);
      document.removeEventListener('click', clicked);
    };
  }, []);
  return null;
}

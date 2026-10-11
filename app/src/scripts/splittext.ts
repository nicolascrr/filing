/** Legacy entry point: the shared reveal engine owns heading choreography. */
import { initReveals, type RevealOptions } from './reveals';

export const SPLIT_SELECTOR = '[data-split]';
export function initSplitText(selector = SPLIT_SELECTOR, options: RevealOptions = {}): () => void {
  return initReveals(selector, options);
}

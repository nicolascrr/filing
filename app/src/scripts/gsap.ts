/**
 * gsap.ts — shared GSAP registration (US-22)
 *
 * Single source of truth for GSAP plugin registration. Importing this
 * module registers every plugin the site uses (ScrollTrigger, SplitText,
 * Flip, Observer, CustomEase) exactly once. GSAP dedupes registration, so
 * component islands that also call `registerPlugin(...)` are harmless.
 *
 * Per AGENTS.md (GSAP section): all plugins are registered here, and every
 * animation respects `prefers-reduced-motion` (handled by the consumers,
 * not here).
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { Flip } from 'gsap/Flip';
import { Observer } from 'gsap/Observer';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(ScrollTrigger, SplitText, Flip, Observer, CustomEase);

export { gsap, ScrollTrigger, SplitText, Flip, Observer, CustomEase };
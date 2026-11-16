import type { ImageMetadata } from 'astro';
import tl1994 from '../assets/timeline/1994.JPG';
import tl1997 from '../assets/timeline/1997.JPG';
import tl2001 from '../assets/timeline/2001.JPG';
import tl2005 from '../assets/timeline/2005.JPG';
import tl2011 from '../assets/timeline/2011.JPG';
import tl2013 from '../assets/timeline/2013.png';
import tl2015 from '../assets/timeline/2015.jpg';
import tl2023 from '../assets/timeline/2023.jpeg';
import tl2024 from '../assets/timeline/2024.jpg';

export interface TimelineMilestone {
  /** Milestone year (display label). */
  year: string;
  /** Client image for the milestone card. */
  image: ImageMetadata;
  /** i18n key for the short caption describing the milestone. */
  textKey: string;
  /** i18n key for the meaningful preview image alternative text. */
  imageAltKey: string;
}

export const timelineMilestones: TimelineMilestone[] = [
  {
    year: '1994',
    image: tl1994,
    textKey: 'accueil.timeline.milestones.y1994',
    imageAltKey: 'accueil.timeline.imageAlt.y1994',
  },
  {
    year: '1997',
    image: tl1997,
    textKey: 'accueil.timeline.milestones.y1997',
    imageAltKey: 'accueil.timeline.imageAlt.y1997',
  },
  {
    year: '2001',
    image: tl2001,
    textKey: 'accueil.timeline.milestones.y2001',
    imageAltKey: 'accueil.timeline.imageAlt.y2001',
  },
  {
    year: '2005',
    image: tl2005,
    textKey: 'accueil.timeline.milestones.y2005',
    imageAltKey: 'accueil.timeline.imageAlt.y2005',
  },
  {
    year: '2011',
    image: tl2011,
    textKey: 'accueil.timeline.milestones.y2011',
    imageAltKey: 'accueil.timeline.imageAlt.y2011',
  },
  {
    year: '2013',
    image: tl2013,
    textKey: 'accueil.timeline.milestones.y2013',
    imageAltKey: 'accueil.timeline.imageAlt.y2013',
  },
  {
    year: '2015',
    image: tl2015,
    textKey: 'accueil.timeline.milestones.y2015',
    imageAltKey: 'accueil.timeline.imageAlt.y2015',
  },
  {
    year: '2023',
    image: tl2023,
    textKey: 'accueil.timeline.milestones.y2023',
    imageAltKey: 'accueil.timeline.imageAlt.y2023',
  },
  {
    year: '2024',
    image: tl2024,
    textKey: 'accueil.timeline.milestones.y2024',
    imageAltKey: 'accueil.timeline.imageAlt.y2024',
  },
];

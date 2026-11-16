import creationLead from '../assets/photos/atelier/creation/creation_lead_image.JPG';
import creation1 from '../assets/photos/atelier/creation/P1001363.JPG';
import creation2 from '../assets/photos/atelier/creation/P1001382.JPG';
import creation3 from '../assets/photos/atelier/creation/P1001422.JPG';
import creation4 from '../assets/photos/atelier/creation/P1001598.JPG';
import creation5 from '../assets/photos/atelier/creation/P1001602.JPG';
import creation6 from '../assets/photos/atelier/creation/P1001603.JPG';
import creation7 from '../assets/photos/atelier/creation/P1001612.JPG';
import productionLead from '../assets/photos/atelier/production/production_lead_image.JPG';
import production1 from '../assets/photos/atelier/production/P1001388.JPG';
import production2 from '../assets/photos/atelier/production/P1001395.jpg';
import production3 from '../assets/photos/atelier/production/P1001396.jpg';
import production4 from '../assets/photos/atelier/production/P1001397.jpg';
import production5 from '../assets/photos/atelier/production/P1001408.JPG';
import cloutage from '../assets/photos/atelier/finition/cloutage.JPG';
import collage from '../assets/photos/atelier/finition/collage.JPG';
import coupe from '../assets/photos/atelier/finition/coupe.jpg';
import nouage from '../assets/photos/atelier/finition/nouage.png';
import reparation from '../assets/photos/atelier/finition/répa.JPG';
import teinture from '../assets/photos/atelier/finition/teinture de tranche.JPG';

// Dedicated, byte-identical copies of the supplied Final selections, in order.
export const creationMedia = [
  creationLead,
  creation1,
  creation2,
  creation3,
  creation4,
  creation5,
  creation6,
  creation7,
];
export const productionMedia = [
  productionLead,
  production1,
  production2,
  production3,
  production4,
  production5,
];
export const finishingMedia = [cloutage, collage, coupe, reparation, nouage, teinture];

export type PresentationGroup = number | {
  axis: 'h' | 'v';
  children: readonly PresentationGroup[];
};

export interface PresentationComposition {
  desktop: PresentationGroup;
  desktopGroups: readonly number[];
  compact: readonly number[];
}

export const presentationCompositions = {
  creation: {
    desktop: { axis: 'h', children: [
      { axis: 'v', children: [0, { axis: 'h', children: [1, 2] }] },
      { axis: 'v', children: [
        { axis: 'h', children: [3, 4] },
        { axis: 'h', children: [5, 6, 7] },
      ] },
    ] },
    desktopGroups: [0, 0, 0, 1, 1, 2, 2, 2],
    compact: [2, 2, 2, 2],
  },
  production: {
    desktop: { axis: 'v', children: [
      { axis: 'h', children: [0, 1] },
      { axis: 'h', children: [2, 3, 4, 5] },
    ] },
    desktopGroups: [0, 0, 1, 1, 1, 1],
    compact: [2, 2, 2],
  },
  finishing: {
    desktop: { axis: 'h', children: [
      { axis: 'v', children: [0, 1] },
      2,
      { axis: 'v', children: [3, 4, 5] },
    ] },
    desktopGroups: [0, 0, 1, 2, 2, 2],
    compact: [2, 2, 2],
  },
} as const satisfies Record<'creation' | 'production' | 'finishing', PresentationComposition>;

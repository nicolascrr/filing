PAGE 1 : ACCUEIL

- This first page welcomes with a headerless hero with a succession of videos playing in the background - as the hero - The hero is fullscreen

There is the logo at the top of the hero. In the left-hand top corner there are the italian and english icons which are buttons to switch the language.
In the right-hand top corner there is a button to open the menu

At the bottom of the hero, there is a written text "BRODERIE DE LUXE DEPUIS 1997"

When you scroll down, there are two small paragraphs that appears, centered with those following labels :
First : "Forte d'une expérience de plus de 30 ans dans la programmation textile, <bold>Fil'ing Broderies</bold>, créée en 1997, a toujours eu le désir de développer la broderie sous toutes ses formes."
Second : "Notre mission ?\n Relever les défis de la personnalisation de vos produits, de la <bold>pièce unique</bold> à la <bold>grande série</bold>.

Then two image card components on the same line, horizontally. One is "Création" and on-click redirects to the page "Création" and the other one is "Production" and on-click redirects to the page "Production".

Then another paragraph which is :

"Partenaire des plus grandes maisons de luxe et du haut de gamme, nous proposons nos compétences à différents secteurs tel que la <bold>maroquinerie</bold>, le <bold>prêt à porter</bold>, les <bold>accessoires</bold>, l'<bold>ammeublement</bold>, le <bold>balnéaire</bold>, l'<bold>évènementiel</bold>, le <bold>packaging...</bold>

Then the timeline component

Then there are 3 logos in a row with their respectives titles and description (located respectivelly under the logo).
They are in a row, horizontally.
First one : title : "<bold>FABRICATION FRANÇAISE</bold>"
description: "L'intégralité de nos productions est réalisée au sein de nos ateliers en France, à proximité de Lyon en région Auvergne-Rhône-Alpes, berceau historique de la tradition textile."

Second : title : "<bold>ENTREPRISE DU PATRIMOINE VIVANT</bold>"
description: "Fil'ing Broderies est, depuis 2023, fière d'être labellisée "Entreprise du Patrimoine Vivant" par la préfecture de la région Auvergne-Rhône-Alpes."

Third : title : "<bold>NOS VALEURS</bold>"
description: "L'implication, l'engagement et surtout l'envie de tous les membres des équipes sont des préoccupations essentielles à la vie de notre entreprise."

Then there is the Teaser component

Finally there is the footer.


PAGE 2 : CRÉATION

Welcomes with a headerless hero. The hero is an image and in its center there is the name of the page in capital letters.

Then there are 3 paragraphs :

1st : "Nous développons vos projets, qu'ils soient sur plans, patrons, fichiers numériques, ou simplement lors d'échanges, toujourts en essayant d'être <bold>au plus près de vos souhaits.</bold>"
2nd : "Notre métier, en constante évolution, impose un suivi permanent des tendances et innovations./n Notre remise en question <bold>permanente</bold> permet de vous présenter des solutions <bold>innovantes</bold> au plus près de vos attentes.
3rd : "Notre département <bold>Rechercher & Développement</bold> sera heureux de répondre à toutes vos demandes."

Under those paragraphs there is a GridGallery

Then there are 2 logos in a row with their respectives titles and description (located respectivelly under the logo).
They are in a row, horizontally.
First one : title : "<bold>5 POSTES DE DÉVELOPPEMENTS</bold>"
description: "Pour donner vie à vos idées"

Second : title : "<bold>+ DE 2000 RÉFÉRENCES DE COULEURS DE FILS</bold>"
description: "Permettant un large choix pour répondre au plus proche de votre projet"

Then the footer


PAGE 3 : PRODUCTION

Welcomes with a headerless hero. The hero is an image and in its center there is the name of the page in capital letters.

Then there are 2 paragraphs :

1st : "L'exigence de nos clients nous oblige à la performance."
2nd : "Nous nous devons de garantir une production de <bold>qualité</bold> dans les délais, en effectuant un contrôle qualité à <bold>chaque étape</bold> de la chaîne de production et en dialoguant en permanence avec les sites de fabrication."

Then there is a grid gallery.

Then there are 4 logos with their respectives titles and description (located respectivelly under the logo).
They are in a square 2 : above and two under.
First one : title : "<bold>3200m²</bold>"
description: "De bâtiment récent"

Second : title : "<bold>PRÉPARATION ET FINITION</bold>"
description: "Un pôle de préparation matière équipé de refendeuses, gutteuses et presses à chaud ainsi qu'un pôle de finition contrôle qualité"

Third : title : "<bold>99 TÊTES DE BRODERIE</bold>"
description: "Divisées en un atelier dédié à l'échantillonnage et un dédié à la production de grandes séries"

Fourth : title : "<bold>3 MACHINES DE DÉCOUPE</bold>"
description: "2 découpes lasers et 1 table numérique à reconnaissance de formes".

Then there is the small carousel component.

Then there are two paragraphs :

"La finition est la touce finale <bold>indispensable</bold> à notre travail pour une qualité <bold>irréprochable</bold>."

"C'est un métier à part entière qui nécessite un oeil <bold>précis</bold> une grande <bold>minutie</bold> du geste./n Point après point, notre atelier apporte le soin final à vos produits."

Then the footer.


PAGE 4: GALERIE


Welcomes with a headerless hero. The hero is an image and in its center there is the name of the page in capital letters.

Then there is a serie of titles, clickable that are spread disorderly on the page in a reasonable area (the user must not scroll to see another one)

They are : "Traditionnelle", "3D", "Cornely", "Macramé", "Coiling", "Perles", "Multi-techniques", "Sequins", "Tuffetage", "Smock", "Matelassé", "Applications", "Patchs", "All-over", "Patchwork", "Découpe", "Gros fil".

When the user click on one, then the titles orders in the top of the page and a grid gallery shows up correesponding to the title selected. Each one of this title is a "page" but must not be accessible from the url.

Then there is the footer


COMPONENENTS :

- IMAGE CARD

A card which is an image, borderless with a border-radius. The card as an animation on hover.

Props : 

- Title --> Corresponding to the title displayed in white at the left-hand bottom corner.


- Timeline

This component is a horizontal interactive timeline carousel that showcases key milestones across multiple years.

The timeline is displayed as a series of vertical cards with rounded corners, arranged side by side. Each card represents a specific year and acts as a visual milestone.

The component uses a horizontal scrolling layout with cards of varying widths.
Most timeline items appear as narrow image panels, while the currently highlighted milestone expands into a large featured card.
The active card occupies significantly more space than the others, creating a strong visual hierarchy.

Each timeline card contains:

A background image related to the milestone.
A year label positioned near the bottom of the card.
For the active milestone, additional content is displayed:
Large year heading (e.g., "2001")
Descriptive text explaining the milestone
Enhanced visual prominence through increased width and color imagery
Visual Design
Rounded corners on all cards.
Combination of full-color imagery for the active item and grayscale imagery for inactive items.
Strong contrast between active and inactive states.
Typography is overlaid directly on images using white text for readability.
Minimalist aesthetic with generous spacing between cards.
Interaction Behavior
Users can click or tap a timeline card to make it active.
When selected:
The card smoothly expands in width.
Additional text content becomes visible.
Other cards shrink to their compact state.
Horizontal scrolling allows navigation through a larger set of milestones.
There are several animations to make everything smooth and a better UX

- Teaser

This component is an image displayed in the full body width. There is a text in the middle alimented by a prop

Props :

- Title : The text displayed in the middle
- Url : Link where the component must redirect on-click


- Grid Gallery

The images in the gallery are disordered. It means that the mosaic must be irregular but matching with the various size of pictures. On clicking there should be 3 different animation style to make the image appear in the foreground. 

Props :

- Animation : Choose the selection


- BigCarousel

There are arrows on the side to navigate. There is a preview of the other images at the bottom of the main image that is displayed. The other one have a light grey layout and the current one is in color. The animation is smooth

- SmallCarousel

In this component you can't click on the image to make it bigger. The mouse scrolling is scrolling the carouse until the last pictures. You can click on the picture to make them bigger (Important : The scroll in a fullscreen pic musn't scroll the background!)

- Menu

The button is the svg embroidery icon. On hover it rotates 90°
On click, the spool of thread is unwinding and shows up the menu which is an elegant and minimalist floating menu with the four main pages such as "Accueil, Création, Production, Galerie".

- Footer

Background color : RGB(50,50,50)

At the top : The logo

Under, there is the the section "CONTACT" surrounded by lines (by style they can be a embroidery threads svg).

Under this section there are 4 icons "mail.png", "adresse.png", "instagram.png" and "linkedin.png"

Then there is another section "TRAJET DEPUIS" surrounded by lines (by style they can be a embroidery threads svg).

Under this section there are 2 small icons with a label on their right
first : img:"gare.png" label:"Gare TGV Lyon Part-Dieu"
second: img"aeroport.png" label:"Aéroport et Gare TGV Lyon Saint-Exupéry.

Finally there is the plan of the website

Just before the end of the screen the Copyright written "2026 Fil'ing Broderies. © Tous droits réservés. Fait par Nicolas et Emilie."


TECHNOLOGIES:

- Barba.js for page transitions, UX and performance optimization
- GASP for page transition and several animations
- Tailwind for the style
- Astro as the main framework and architecture


# FIL'ING BRODERIES - WEBSITE SPECIFICATION

## PROJECT OVERVIEW

### Objective

Create a multilingual showcase website for Fil'ing Broderies, a French luxury embroidery manufacturer.

The website must communicate:

* Luxury
* Craftsmanship
* Industrial expertise
* French manufacturing
* Heritage and know-how

The website is not intended to generate leads directly. Its primary purpose is to showcase the company's expertise, capabilities, and achievements.

### Key Message

Fil'ing Broderies is a French luxury embroidery manufacturer combining traditional craftsmanship with industrial production capabilities.

---

# DESIGN PRINCIPLES

## Brand Positioning

The design must convey:

* Luxury
* Craftsmanship
* Industrial precision

The visual direction should remain elegant, minimalist and timeless.

Animations should feel premium and subtle, never excessive.

---

## Typography

### Headings

Font:
Poppins

### Body

Font:
Noto Sans

---

## Colors

### Body Background

White

### Footer Background

RGB(50,50,50)

### Remaining Colors

TODO - Define visual identity colors.

---

## Visual Identity

TODO

To be completed later:

* Brand colors
* Accent colors
* Border radius
* Shadows
* Visual motifs
* Iconography rules

---

# TECHNICAL STACK

## Framework

Astro

## Styling

Tailwind CSS

## Animations

GSAP

## Page Transitions

Barba.js

---

# MULTILINGUAL ARCHITECTURE

## Supported Languages

* French (default)
* English
* Italian

## Translation Strategy

All content must be stored in translation files:

* fr.json
* en.json
* it.json

No visible text should be hardcoded inside components.

A locale cookie must store the selected language.

Default locale:
French

When a language is selected:

* Save locale in cookie
* Load corresponding translation file
* Persist selection across navigation

---

# RESPONSIVE RULES

## Mobile

Creation and Production cards must stack vertically.

Timeline must remain vertically scrollable within the page flow.

Footer content must adapt to smaller screens while preserving readability.

Gallery layout must remain responsive.

---

# GLOBAL LAYOUT

## Content Width

TODO

A constrained content width must be used.

The website must not use full-width content sections except when explicitly stated.

---

## Spacing

Use balanced and consistent whitespace throughout the entire website.

Spacing rhythm must remain coherent between sections.

---

# PAGE STRUCTURE

---

# PAGE 1 - ACCUEIL

## Section 1 - Hero

Headerless fullscreen hero.

Content:

* Background video
* Video loops continuously
* Company logo at top center
* Language switcher at top left
* Menu button at top right
* Text at bottom:

"BRODERIE DE LUXE DEPUIS 1997"

---

## Section 2 - Introduction

Centered text block.

Paragraph 1:

"Forte d'une expérience de plus de 30 ans dans la programmation textile, Fil'ing Broderies, créée en 1997, a toujours eu le désir de développer la broderie sous toutes ses formes."

Paragraph 2:

"Notre mission ? Relever les défis de la personnalisation de vos produits, de la pièce unique à la grande série."

---

## Section 3 - Services

Two ImageCard components displayed horizontally.

Card 1:

Création

Redirect:
Création page

Card 2:

Production

Redirect:
Production page

---

## Section 4 - Expertise

Paragraph:

"Partenaire des plus grandes maisons de luxe et du haut de gamme..."

(Use exact provided text)

---

## Section 5 - Timeline

Timeline component.

10 hardcoded milestones.

No autoplay.

---

## Section 6 - Company Values

Three logo blocks displayed horizontally.

### Fabrication Française

Description:
(Provided text)

### Entreprise du Patrimoine Vivant

Description:
(Provided text)

### Nos Valeurs

Description:
(Provided text)

---

## Section 7 - Teaser

Teaser component.

---

## Section 8 - Footer

Footer component.

---

# PAGE 2 - CRÉATION

## Hero

Headerless image hero.

Centered title in uppercase.

---

## Introduction

Three paragraphs.

(Use exact provided content)

---

## Gallery

GridGallery component.

---

## Statistics

Two logo blocks displayed horizontally.

### 5 Postes de Développements

Description:
Pour donner vie à vos idées

### + de 2000 Références de Couleurs de Fils

Description:
Permettant un large choix pour répondre au plus proche de votre projet

---

## Footer

Footer component.

---

# PAGE 3 - PRODUCTION

## Hero

Headerless image hero.

Centered title.

---

## Introduction

Two paragraphs.

(Use exact provided content)

---

## Gallery

GridGallery component.

---

## Statistics

Four logo blocks displayed in a 2x2 grid.

### 3200m²

Description:
De bâtiment récent

### Préparation et Finition

Description:
(Provided text)

### 99 Têtes de Broderie

Description:
(Provided text)

### 3 Machines de Découpe

Description:
(Provided text)

---

## SmallCarousel

SmallCarousel component.

---

## Finishing Section

Two paragraphs.

(Use exact provided content)

---

## Footer

Footer component.

---

# PAGE 4 - GALERIE

## Hero

Headerless image hero.

Centered title.

---

## Category Selector

The following categories must appear inside a creative freeform layout visible without scrolling:

* Traditionnelle
* 3D
* Cornely
* Macramé
* Coiling
* Perles
* Multi-techniques
* Sequins
* Tuffetage
* Smock
* Matelassé
* Applications
* Patchs
* All-over
* Patchwork
* Découpe
* Gros fil

---

## Filtering Behaviour

When a category is selected:

* Categories move to the top area
* GridGallery appears
* Corresponding images are displayed

Categories behave like internal states.

No URL changes.

No category-specific routes.

---

## Footer

Footer component.

---

# COMPONENTS

## ImageCard

### Description

Borderless image card with rounded corners.

Hover animation required.

### Props

title: string

image: string

href: string

---

## Timeline

Interactive horizontal timeline.

### Data Source

Hardcoded.

### Entries

10 milestones.

### Behaviour

* Horizontal layout
* Expandable active card
* Smooth transitions
* Active card larger than inactive cards
* Active card displays additional content
* Horizontal navigation

Must match the supplied visual reference.

---

## GridGallery

### Description

Irregular masonry layout.

Image sizes should create a natural mosaic.

### Behaviour

Clicking an image enlarges only the selected image.

No carousel.

### Props

animation: string

Supported values:

* fade
* zoom
* slide

(To be adjusted later)

---

## BigCarousel

### Behaviour

* Infinite loop
* No autoplay
* Horizontal thumbnails
* Smooth transitions

---

## SmallCarousel

### Behaviour

* Mouse wheel scrolls gallery images
* Wheel interaction takes priority while hovered
* Clicking an image opens an enlarged version
* Background page must not scroll while enlarged image is open

---

## Teaser

### Description

Full-width image.

Centered text.

Clickable.

### Props

title: string

url: string

---

## Menu

### Trigger

Embroidery SVG icon.

### Hover

Rotate 90°.

### Click

Embroidery spool animation.

Thread unwinds and reveals navigation.

### Navigation

* Accueil
* Création
* Production
* Galerie

Visual style:

Elegant, minimalist and floating.

---

## Footer

Background:
RGB(50,50,50)

### Structure

Logo

CONTACT section

Icons:

* mail
* adresse
* instagram
* linkedin

Social links open in a new tab.

TRAJET DEPUIS section

Items:

* Gare TGV Lyon Part-Dieu
* Aéroport et Gare TGV Lyon Saint-Exupéry

Site map

Copyright:

2026 Fil'ing Broderies. © Tous droits réservés. Fait par Nicolas et Emilie.

---

# ACCESSIBILITY

Accessibility must be considered throughout the project.

Semantic HTML should be preferred.

Interactive elements must be keyboard accessible.

Images must support alt text.

---

# PERFORMANCE

Priority:

Balanced experience between visual quality and performance.

Astro image optimization should be enabled whenever possible.

Use lazy loading for non-critical media.

---

# NON-NEGOTIABLES

* Preserve the luxury and craftsmanship positioning.
* Do not create a corporate-looking website.
* Keep animations elegant and subtle.
* Use the provided page structure.
* Use the supplied timeline design.
* Do not invent additional pages.
* Keep all content hardcoded and translation-driven.
* When information is missing, use the simplest elegant implementation and keep the architecture extensible.





/** Browser-safe category labels, in the established navigation order. */
export const galleryCategories = [
  ['traditionnelle', 'Traditionnelle'],
  ['3d', '3D'],
  ['cornely', 'Cornely'],
  ['macrame', 'Macramé'],
  ['perles', 'Perles'],
  ['multi-techniques', 'Multi-techniques'],
  ['sequins', 'Sequins'],
  ['tuffetage', 'Tuffetage'],
  ['smock', 'Smock'],
  ['matelasse', 'Matelassé'],
  ['applications', 'Applications'],
  ['patchs', 'Patchs'],
  ['all-over', 'All-over'],
  ['patchwork', 'Patchwork'],
  ['decoupe', 'Découpe'],
  ['gros-fil', 'Gros fil'],
].map(([key, folder]) => ({ key: key!, folder, labelKey: `galerie.categories.${key}` }));

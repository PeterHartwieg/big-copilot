// Representative real fonts alongside the pseudo-locale: Korean phone and Russian desktop wrapping.
// Catalogue/placeholder tests continue to cover every shipped language.
const {expansionTests} = require('./_i18n_expansion.cjs');
expansionTests(['ko', 'ru']);

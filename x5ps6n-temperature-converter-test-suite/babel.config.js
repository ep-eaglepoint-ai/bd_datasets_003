'use strict';

// Use standard Babel presets so Jest can transform ESM/JSX when run from root.
// Resolves from root node_modules or repository_before (CRA) so it works with or without root install.
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
  ],
};

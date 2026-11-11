const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
export default {
  output: 'static',
  base: process.env.BASE_PATH || (repo && !repo.endsWith('.github.io') ? '/' + repo : '/'),
  trailingSlash: 'always',
  devToolbar: {enabled: false},
  vite: {optimizeDeps: {exclude: ['astro > aria-query', 'astro > axobject-query']}},
};
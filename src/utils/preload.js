export const preloadCriticalResources = () => {
  // Preload only assets that exist in the project.
  // Use BASE_URL to work correctly in both dev and GitHub Pages deployment.
  const base = import.meta.env.BASE_URL || '/';

  const preloadLink = (href, as, type) => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = href;
    link.as = as;
    if (type) link.type = type;
    document.head.appendChild(link);
  };

  preloadLink(`${base}favicon.svg`, 'image', 'image/svg+xml');
};

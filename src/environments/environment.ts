// Production environment - used by `ng build` (defaultConfiguration is
// "production" in angular.json). Set the deployed backend's public URL
// here when you build for production. The value can also be overridden
// via a global `window.__env.apiUrl` (read in app.config.ts) which lets
// you redeploy the frontend without rebuilding.
export const environment = {
  production: true,
  apiUrl: 'https://api.your-comex-domain.example/api',
};

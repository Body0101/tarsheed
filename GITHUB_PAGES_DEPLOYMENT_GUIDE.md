# GitHub Pages Deployment Guide for Tarshid Smart Building System

## Issue Analysis

The deployed website at `https://body0101.github.io/tarsheed/` is returning 404 errors for assets because:

1. **Base Path Configuration**: Assets are generated with `/tarsheed/` prefix but GitHub Pages may not be serving from the correct subdirectory
2. **Asset Path Resolution**: Generated HTML may not be referencing assets with the correct base path

## Solution Steps

### 1. Verify Vite Configuration

Ensure `vite.config.js` has the correct base path:

```javascript
export default defineConfig({
  base: '/tarsheed/',  // ✅ Already set correctly
  // ... rest of config
});
```

### 2. Check Generated HTML

The generated `index.html` should reference assets with the correct base path:

```html
<!-- Should look like this -->
<link rel="stylesheet" href="/tarsheed/assets/css/index-xxxx.css" />
<script type="module" src="/tarsheed/assets/js/index-xxxx.js"></script>
```

### 3. GitHub Pages Repository Settings

Ensure GitHub repository is configured correctly:

1. Go to repository **Settings > Pages**
2. Set **Source** to "Deploy from a branch"
3. Set **Branch** to `main` (or your default branch)
4. Set **Folder** to `/root` (NOT `/tarsheed`)
5. **Custom domain**: Leave empty for `username.github.io`

### 4. Build and Deploy Process

#### Step 1: Clean Build
```bash
npm run build
```

#### Step 2: Deploy to GitHub
```bash
git add dist/
git commit -m "Deploy to GitHub Pages"
git push origin main
```

### 5. Troubleshooting

#### If assets still return 404:

1. **Check GitHub Pages deployment status**
   - Go to repository Settings > Pages
   - Look for deployment errors
   - Check if build is successful

2. **Verify asset paths in dist/index.html**
   - Open `dist/index.html` in browser
   - Check if asset URLs include `/tarsheed/` prefix

3. **Test local build**
   ```bash
   npm run preview
   ```
   - Access `http://localhost:4173/tarsheed/`
   - Verify all assets load correctly

4. **Check GitHub Pages URL structure**
   - Visit: `https://body0101.github.io/tarsheed/`
   - Check browser console for asset loading errors

### 6. Alternative Solutions

#### Option A: Root Deployment
If subdirectory deployment continues to fail:

1. Change `vite.config.js` base path:
   ```javascript
   base: '/',
   ```

2. Update GitHub Pages settings:
   - Set **Folder** to `/root`
   - Deploy to root domain instead

3. Update any hardcoded paths in code

#### Option B: GitHub Actions Deployment
Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [ main ]
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Setup Pages
        uses: actions/configure-pages@v4
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run build
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### 7. Verification Checklist

After deployment, verify:

- [ ] Main page loads at `https://body0101.github.io/tarsheed/`
- [ ] All CSS files load (check Network tab)
- [ ] All JS files load (check Console for errors)
- [ ] Images and icons load correctly
- [ ] PWA service worker registers
- [ ] Routing works (refresh page, navigate)
- [ ] No 404 errors in browser console
- [ ] Supabase authentication works
- [ ] Real-time features function

### 8. Common Issues and Solutions

#### Issue: Assets return 404
**Solution**: Ensure base path matches GitHub Pages deployment folder

#### Issue: Routing doesn't work
**Solution**: Add proper 404.html redirect for SPA routing

#### Issue: PWA doesn't register
**Solution**: Check service worker scope and registration

### 9. Final Deployment Command

```bash
# Complete deployment process
npm run build
git add dist/
git commit -m "Fix GitHub Pages deployment with correct asset paths"
git push origin main
```

### 10. Monitoring

After deployment, monitor:
- GitHub Pages deployment logs
- Browser console errors
- Network requests for assets
- Application functionality

This guide should resolve the 404 asset loading issues on GitHub Pages deployment.

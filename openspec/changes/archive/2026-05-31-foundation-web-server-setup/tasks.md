## 1. Project Bootstrap

- [x] 1.1 Create `package.json` with `name`, `main`, `scripts.start`, and dependencies: `express`, `cors`
- [x] 1.2 Run `npm install` to generate `node_modules` and `package-lock.json`

## 2. Express Server

- [x] 2.1 Create `src/server/index.js` — initialise Express app, apply `express.json()` and `cors()` middleware, mount routes, serve `src/client` as static, listen on port 3000
- [x] 2.2 Create `src/server/routes/recipe.js` — export Express router with POST `/` handler returning 501 stub
- [x] 2.3 Create `src/server/routes/rewrite.js` — export Express router with POST `/` handler returning 501 stub
- [x] 2.4 Create `src/server/routes/substitute.js` — export Express router with POST `/` handler returning 501 stub
- [x] 2.5 Mount the three route files in `index.js` at `/api/recipe`, `/api/rewrite`, `/api/substitute`

## 3. Client Shell

- [x] 3.1 Create `src/client/index.html` — HTML5 boilerplate with header ("Recipe Generator"), two-panel `<main>` (left: textarea + serves input + Generate button; right: recipe output div), and `<script src="app.js">`
- [x] 3.2 Create `src/client/style.css` — base reset, header bar, two-column flex layout for the main panels
- [x] 3.3 Create `src/client/app.js` — wire Generate Recipe button click to POST `/api/recipe` with `{ ingredients, serves }` and log the response; link stylesheet in index.html

## 4. Verification

- [x] 4.1 Start the server with `npm start` and confirm it logs ready on port 3000
- [x] 4.2 Open `http://localhost:3000` and confirm the two-panel layout renders with header
- [x] 4.3 Click Generate Recipe and confirm a POST to `/api/recipe` appears in the network tab (501 response expected)

# Client Shell Spec

## Requirement: Page renders a two-panel layout
The client SHALL render a left input panel and a right output panel side by side.

### Scenario: Layout present on load
- **WHEN** the page is loaded in a browser
- **THEN** a left panel and a right panel are visible

## Requirement: Left panel contains ingredient input and generate button
The left panel SHALL contain a multi-line text input for ingredients and a "Generate Recipe" button.

### Scenario: Input and button present
- **WHEN** the page is loaded
- **THEN** a textarea for ingredient entry and a "Generate Recipe" button are visible in the left panel

## Requirement: Right panel contains a recipe output area
The right panel SHALL contain a recipe card area that is initially empty.

### Scenario: Output area present on load
- **WHEN** the page is loaded
- **THEN** a recipe output container is visible in the right panel and displays no content

## Requirement: Header displays app name
The page SHALL have a header bar showing the app name "Recipe Generator".

### Scenario: Header visible
- **WHEN** the page is loaded
- **THEN** the header contains the text "Recipe Generator"

## Requirement: Generate button posts to /api/recipe
When the Generate Recipe button is clicked, `app.js` SHALL POST the ingredients and serves value to `/api/recipe`.

### Scenario: Button triggers POST
- **WHEN** ingredients are entered and the Generate Recipe button is clicked
- **THEN** a POST request is sent to `/api/recipe` with `{ ingredients, serves }`

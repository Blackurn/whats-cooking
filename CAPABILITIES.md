# Recipe Generator — Full Capabilities

A local-AI-powered recipe web app. Enter ingredients you have, get a full recipe back. Refine it with dietary options, substitutions, and serving adjustments — all powered by a local LLM via Ollama.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + CSS |
| Backend | Node.js + Express |
| AI | Ollama (local LLM — `tinyllama` or `phi3.5`) |
| Tests | Playwright (E2E integration tests) |
| CI/CD | GitHub Actions |
| Dev Environment | Dev Container (Docker) |

---

## Features

### 1. Ingredient Input
- Free-text input field for entering available ingredients
- Comma-separated or line-by-line entry
- "Generate Recipe" button triggers AI call

### 2. Recipe Generation
- AI generates a full recipe based on entered ingredients
- Output includes: dish name, ingredients list with quantities, step-by-step method
- Streaming response (text appears progressively, not all at once)

### 3. Dietary Rewrite
- Buttons: **Make it Vegan**, **Make it Gluten-Free**, **Make it Dairy-Free**
- Sends current recipe back to the model with a rewrite instruction
- Recipe card updates in place

### 4. Ingredient Substitution
- "I don't have X" input below the generated recipe
- AI responds with a substitution suggestion in context of the current recipe
- Displayed as an inline hint beneath the relevant ingredient

### 5. Serving Adjuster
- Number input: "Serves" (default 2)
- On change, AI rescales all quantities in the recipe
- Quantities update in the ingredients list

### 6. Flavour Pairing Hints
- Before generating, a small panel shows flavour pairing suggestions for the entered ingredients
- Lightweight separate AI call, dismissible

### 7. Recipe History
- Previously generated recipes stored in `localStorage`
- Accessible via a side panel or dropdown
- Click to reload a past recipe

---

## Window Layout

### Main Application

```mermaid
graph TD
    subgraph Browser["Browser Window"]
        subgraph Header["Header Bar"]
            Logo["🍳 Recipe Generator"]
            Nav["History ▾"]
        end

        subgraph Main["Main Content"]
            subgraph Left["Left Panel — Input"]
                Ingredients["Ingredients Input\n──────────────\ntomatoes, pasta,\ngarlic, olive oil\n──────────────"]
                Serves["Serves: [ 2 ]"]
                Generate["[ Generate Recipe ]"]
                Pairing["💡 Flavour Pairings\nTomato + Basil ✓\nGarlic + Parsley ✓"]
            end

            subgraph Right["Right Panel — Output"]
                RecipeCard["Recipe Card\n──────────────\n🍝 Garlic Pasta\n\nIngredients:\n• 200g pasta\n• 3 cloves garlic\n• 2 tbsp olive oil\n\nMethod:\n1. Boil pasta...\n2. Fry garlic..."]
                DietaryButtons["[ Vegan ] [ Gluten-Free ] [ Dairy-Free ]"]
                SubInput["I don't have: [ garlic    ] [ Substitute ]"]
            end
        end
    end
```

### Streaming Response State

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Browser
    participant API as Express API
    participant OL as Ollama

    U->>UI: Enters ingredients, clicks Generate
    UI->>API: POST /api/recipe { ingredients, serves }
    API->>OL: POST /api/generate (stream: true)
    OL-->>API: Token stream
    API-->>UI: Server-Sent Events (token chunks)
    UI-->>U: Recipe text appears progressively
```

### Dietary Rewrite Flow

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Browser
    participant API as Express API
    participant OL as Ollama

    U->>UI: Clicks "Make it Vegan"
    UI->>API: POST /api/rewrite { recipe, instruction: "make vegan" }
    API->>OL: POST /api/generate with rewrite prompt
    OL-->>API: Token stream
    API-->>UI: Updated recipe replaces current card
    UI-->>U: Dairy/meat references replaced
```

### Substitution Flow

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Browser
    participant API as Express API
    participant OL as Ollama

    U->>UI: Types "garlic" in substitution field, clicks Substitute
    UI->>API: POST /api/substitute { ingredient: "garlic", recipe }
    API->>OL: Prompt asking for substitution in context
    OL-->>API: Suggestion text
    API-->>UI: Inline hint shown under ingredient in card
```

---

## Page States

```mermaid
stateDiagram-v2
    [*] --> Empty : App loads
    Empty --> Generating : User clicks Generate
    Generating --> RecipeReady : Stream complete
    RecipeReady --> Rewriting : User clicks dietary button
    Rewriting --> RecipeReady : Rewrite complete
    RecipeReady --> Substituting : User submits substitution
    Substituting --> RecipeReady : Substitution shown
    RecipeReady --> Generating : User changes ingredients
    RecipeReady --> [*]
```

---

## GitHub Actions Pipeline

```mermaid
flowchart LR
    Push["git push"] --> Trigger["GitHub Actions Triggered"]
    Trigger --> Container["Start Dev Container"]
    Container --> Ollama["Install + Start Ollama\npull tinyllama"]
    Ollama --> App["Start Express App"]
    App --> PW["Run Playwright Tests"]
    PW --> Pass{"All pass?"}
    Pass -->|Yes| Green["✅ Pipeline green"]
    Pass -->|No| Red["❌ Pipeline fails\nUpload test report"]
```

---

## Playwright Test Coverage

| Test | What it verifies |
|---|---|
| `recipe-generation.spec.ts` | Enter ingredients → recipe card appears with title and method |
| `streaming.spec.ts` | Text appears progressively (not all at once) |
| `dietary-rewrite.spec.ts` | Click Vegan → recipe no longer contains "butter" or "chicken" |
| `substitution.spec.ts` | Submit missing ingredient → inline hint appears |
| `serving-adjuster.spec.ts` | Change serves to 8 → quantities in card update |
| `history.spec.ts` | Generate two recipes → both appear in history panel |

---

## Dev Container Setup

```mermaid
graph TD
    DC["devcontainer.json"] --> Features["Features"]
    Features --> Node["Node.js 20"]
    Features --> Docker["Docker-in-Docker"]
    DC --> PostCreate["postCreateCommand"]
    PostCreate --> Install["npm install"]
    PostCreate --> OllamaInstall["Install Ollama CLI"]
    PostCreate --> ModelPull["ollama pull tinyllama"]
    DC --> Ports["forwardPorts: [3000, 11434]"]
```

---

## Folder Structure

```
RecipeGenerator/
├── .devcontainer/
│   └── devcontainer.json
├── .github/
│   └── workflows/
│       └── ci.yml
├── src/
│   ├── server/
│   │   ├── index.js          # Express app
│   │   └── routes/
│   │       ├── recipe.js     # POST /api/recipe
│   │       ├── rewrite.js    # POST /api/rewrite
│   │       └── substitute.js # POST /api/substitute
│   └── client/
│       ├── index.html
│       ├── app.js
│       └── style.css
├── tests/
│   ├── recipe-generation.spec.ts
│   ├── dietary-rewrite.spec.ts
│   ├── substitution.spec.ts
│   ├── serving-adjuster.spec.ts
│   └── history.spec.ts
├── CAPABILITIES.md
└── package.json
```

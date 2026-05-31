# What's Cooking

A local AI-powered recipe generator. Tell it what ingredients you have and it gives you a full recipe — complete with quantities, method, and options to rewrite for dietary needs or substitute missing ingredients. Everything runs on your machine via [Ollama](https://ollama.ai/); no data leaves your device.

## Features

- Generate recipes from a list of ingredients
- Stream the response progressively as it's written
- Rewrite for dietary requirements (vegan, gluten-free, dairy-free)
- Substitute a missing ingredient in context
- Adjust quantities by serving size
- Recipe history saved locally

## Getting Started

### 1. Install prerequisites

- [Node.js 20+](https://nodejs.org/)
- [Ollama](https://ollama.ai/) — follow the install instructions for your platform

### 2. Pull a model

```bash
ollama pull tinyllama
```

`tinyllama` is the recommended starting model. `phi3.5` also works well.

### 3. Clone and install

```bash
git clone https://github.com/Blackurn/whats-cooking.git
cd whats-cooking
npm install
```

### 4. Start the app

Make sure Ollama is running, then:

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together.

## Contributing

Issues and pull requests welcome at [github.com/Blackurn/whats-cooking](https://github.com/Blackurn/whats-cooking).

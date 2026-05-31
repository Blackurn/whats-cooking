// Stubs the /api/recipe endpoint (browser→server boundary) rather than the
// Ollama endpoint, because Playwright page.route() only intercepts browser-side
// requests and Ollama is called server-side.
async function stubOllama(page, responseText) {
  await page.route('**/api/recipe', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ recipe: responseText }),
    });
  });
}

module.exports = { stubOllama };

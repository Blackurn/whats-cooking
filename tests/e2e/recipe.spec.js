const { test, expect } = require('@playwright/test');
const { stubOllama } = require('./helpers/ollamaStub');

test('generates a recipe from ingredients', async ({ page }) => {
  await stubOllama(
    page,
    'Tomato Pasta\n\nIngredients:\n- 200g pasta\n- 2 tomatoes, chopped\n- 2 cloves garlic\n\nMethod:\n1. Cook pasta. 2. Fry garlic. 3. Add tomatoes. 4. Combine.'
  );

  await page.goto('/');
  await page.fill('#ingredients', 'pasta, tomatoes, garlic');
  await page.click('#generate-btn');

  await expect(page.locator('#recipe-output')).toContainText('pasta', {
    timeout: 10_000,
  });
});

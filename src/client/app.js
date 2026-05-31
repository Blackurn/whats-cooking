const generateBtn = document.getElementById('generate-btn');
const ingredientsInput = document.getElementById('ingredients');
const servesInput = document.getElementById('serves');
const recipeOutput = document.getElementById('recipe-output');

generateBtn.addEventListener('click', async () => {
  const ingredients = ingredientsInput.value.trim();
  if (!ingredients) return;

  recipeOutput.textContent = 'Generating…';

  try {
    const res = await fetch('/api/recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredients, serves: Number(servesInput.value) }),
    });

    const data = await res.json();
    recipeOutput.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    recipeOutput.textContent = `Error: ${err.message}`;
  }
});

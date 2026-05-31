const express = require('express');
const cors = require('cors');
const path = require('path');

const recipeRouter = require('./routes/recipe');
const rewriteRouter = require('./routes/rewrite');
const substituteRouter = require('./routes/substitute');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.use('/api/recipe', recipeRouter);
app.use('/api/rewrite', rewriteRouter);
app.use('/api/substitute', substituteRouter);

app.use(express.static(path.join(__dirname, '../../src/client')));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

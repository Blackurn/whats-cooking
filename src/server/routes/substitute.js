const { Router } = require('express');

const router = Router();

router.post('/', (req, res) => {
  res.status(501).json({ message: 'Not yet implemented' });
});

module.exports = router;

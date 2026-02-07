const express = require('express');
const router = express.Router();
const { createPoll, getPoll, vote, getResults } = require('../controllers/pollController');

router.post('/', createPoll);
router.get('/:id', getPoll);
router.post('/:id/vote', vote);
router.get('/:id/results', getResults);

module.exports = router;

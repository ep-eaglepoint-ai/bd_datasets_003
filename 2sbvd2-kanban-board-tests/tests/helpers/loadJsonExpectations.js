const fs = require('fs')
const path = require('path')

function loadJsonExpectations() {
	const jsonPath = path.resolve(
		__dirname,
		'..',
		'..',
		'repository_after',
		'kanban_app',
		'data.json',
	)

	const raw = fs.readFileSync(jsonPath, 'utf8')
	const parsed = JSON.parse(raw)

	const board = parsed.boards[0]

	const expectedColumnCount = board.columns.length
	const expectedTotalCards = board.columns.reduce(
		(sum, col) => sum + col.cards.length,
		0,
	)

	const expectedByColumnId = {}
	board.columns.forEach((col) => {
		expectedByColumnId[col.id] = {
			title: col.title,
			cardCount: col.cards.length,
		}
	})

	return {
		boardName: board.name,
		expectedColumnCount,
		expectedTotalCards,
		expectedByColumnId,
	}
}

module.exports = { loadJsonExpectations }

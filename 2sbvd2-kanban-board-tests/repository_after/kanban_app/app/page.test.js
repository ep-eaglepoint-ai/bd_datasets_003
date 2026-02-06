import {
	render,
	screen,
	within,
	fireEvent,
	waitFor,
} from '@testing-library/react'
import Home from './page'
import data from '../data.json'

function makeDataTransfer() {
	return {
		effectAllowed: '',
		dropEffect: '',
		setData: () => {},
		getData: () => '',
	}
}

function getColumnEl(columnId) {
	return screen.getByTestId(`column-${columnId}`)
}

function getCardEl(cardId) {
	return screen.getByTestId(`card-${cardId}`)
}

describe('Board Component', () => {
	beforeEach(() => {
		render(<Home />)
	})

	test('renders board title from JSON in h1 element', () => {
		const boardName = data.boards[0].name
		expect(
			screen.getByRole('heading', { level: 1, name: boardName }),
		).toBeInTheDocument()
	})

	test('renders board subtitle text', () => {
		const subtitle = 'Drag cards between columns to update their status'
		expect(screen.getByText(subtitle)).toBeInTheDocument()
	})

	test('renders kanban board container with correct test id', () => {
		expect(screen.getByTestId('kanban-board')).toBeInTheDocument()
	})

	test('renders correct number of columns from JSON', () => {
		const expectedColumns = data.boards[0].columns.length
		expect(screen.getAllByTestId(/^column-/)).toHaveLength(expectedColumns)
	})

	test('renders total number of cards across all columns (should be 8)', () => {
		expect(screen.getAllByTestId(/^card-/)).toHaveLength(8)
	})

	test('renders edge case: dropping without dragging does not change board', async () => {
		const col1 = data.boards[0].columns[0]
		const col2 = data.boards[0].columns[1]

		const col1El = getColumnEl(col1.id)
		const col2El = getColumnEl(col2.id)

		expect(
			within(col1El).getByText(col1.cards.length.toString()),
		).toBeInTheDocument()
		expect(
			within(col2El).getByText(col2.cards.length.toString()),
		).toBeInTheDocument()

		const dt = makeDataTransfer()
		fireEvent.drop(col2El, { dataTransfer: dt })

		await waitFor(() => {
			expect(
				within(getColumnEl(col1.id)).getByText(
					col1.cards.length.toString(),
				),
			).toBeInTheDocument()
			expect(
				within(getColumnEl(col2.id)).getByText(
					col2.cards.length.toString(),
				),
			).toBeInTheDocument()
		})
	})
})

describe('Column Components', () => {
	beforeEach(() => {
		render(<Home />)
	})

	test('renders all column titles correctly', () => {
		const columnTitles = data.boards[0].columns.map((col) => col.title)

		columnTitles.forEach((title) => {
			expect(
				screen.getByRole('heading', { level: 2, name: title }),
			).toBeInTheDocument()
		})
	})

	test('renders correct card count badge for each column', () => {
		data.boards[0].columns.forEach((column) => {
			const columnElement = getColumnEl(column.id)
			expect(
				within(columnElement).getByText(column.cards.length.toString()),
			).toBeInTheDocument()
		})
	})

	test('renders edge case: dragOver sets dropEffect to move', () => {
		const col = data.boards[0].columns[0]
		const colEl = getColumnEl(col.id)

		const dt = makeDataTransfer()
		fireEvent.dragOver(colEl, { dataTransfer: dt })

		expect(dt.dropEffect).toBe('move')
	})
})

describe('Card Components', () => {
	beforeEach(() => {
		render(<Home />)
	})

	test('renders card title, description, assignee, and due date correctly', () => {
		data.boards[0].columns.forEach((column) => {
			column.cards.forEach((card) => {
				const cardElement = getCardEl(card.id)

				expect(
					within(cardElement).getByText(card.title),
				).toBeInTheDocument()
				expect(
					within(cardElement).getByText(card.description),
				).toBeInTheDocument()
				expect(
					within(cardElement).getByText(card.assignee),
				).toBeInTheDocument()
				expect(
					within(cardElement).getByText(card.dueDate),
				).toBeInTheDocument()
			})
		})
	})

	test('renders priority badge with correct class', () => {
		data.boards[0].columns.forEach((column) => {
			column.cards.forEach((card) => {
				const cardElement = getCardEl(card.id)

				const priorityBadge = within(cardElement).getByText(
					card.priority,
				)
				expect(priorityBadge).toHaveClass(`priority-${card.priority}`)
			})
		})
	})

	test('renders correct assignee initials', () => {
		data.boards[0].columns.forEach((column) => {
			column.cards.forEach((card) => {
				const cardElement = getCardEl(card.id)

				const expectedInitials = card.assignee
					.split(' ')
					.map((n) => n[0])
					.join('')
					.toUpperCase()

				expect(
					within(cardElement).getByText(expectedInitials),
				).toBeInTheDocument()
			})
		})
	})

	test('renders all cards with correct test ids', () => {
		data.boards[0].columns.forEach((column) => {
			column.cards.forEach((card) => {
				expect(getCardEl(card.id)).toBeInTheDocument()
			})
		})
	})

	test('renders edge case: dragging a card moves it across columns and updates counts', async () => {
		const col1 = data.boards[0].columns[0]
		const col2 = data.boards[0].columns[1]
		const cardToMove = col1.cards[0]

		const col1El = getColumnEl(col1.id)
		const col2El = getColumnEl(col2.id)
		const cardEl = getCardEl(cardToMove.id)

		expect(
			within(col1El).getByText(col1.cards.length.toString()),
		).toBeInTheDocument()
		expect(
			within(col2El).getByText(col2.cards.length.toString()),
		).toBeInTheDocument()

		const dt = makeDataTransfer()

		fireEvent.dragStart(cardEl, { dataTransfer: dt })
		expect(dt.effectAllowed).toBe('move')

		fireEvent.drop(col2El, { dataTransfer: dt })

		await waitFor(() => {
			const updatedCol1El = getColumnEl(col1.id)
			const updatedCol2El = getColumnEl(col2.id)

			expect(
				within(updatedCol2El).getByTestId(`card-${cardToMove.id}`),
			).toBeInTheDocument()
			expect(
				within(updatedCol1El).queryByTestId(`card-${cardToMove.id}`),
			).toBeNull()

			expect(
				within(updatedCol1El).getByText(
					(col1.cards.length - 1).toString(),
				),
			).toBeInTheDocument()
			expect(
				within(updatedCol2El).getByText(
					(col2.cards.length + 1).toString(),
				),
			).toBeInTheDocument()
		})
	})

	test('renders moving a card within the same column leaves total card count unchanged', async () => {
		const col1 = data.boards[0].columns[0]
		const cardToMove = col1.cards[1]

		const col1El = getColumnEl(col1.id)
		const cardEl = getCardEl(cardToMove.id)

		const dt = makeDataTransfer()

		fireEvent.dragStart(cardEl, { dataTransfer: dt })
		fireEvent.drop(col1El, { dataTransfer: dt })

		await waitFor(() => {
			const updatedCol1El = getColumnEl(col1.id)

			expect(
				within(updatedCol1El).getByTestId(`card-${cardToMove.id}`),
			).toBeInTheDocument()

			expect(
				within(updatedCol1El).getByText(col1.cards.length.toString()),
			).toBeInTheDocument()
		})
	})
})

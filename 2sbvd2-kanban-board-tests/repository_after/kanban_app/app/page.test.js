// repository_after/kanban_app/app/page.test.js

import { render, screen, within } from '@testing-library/react'
import Home from './page'
import data from '../data.json'

describe('Board Component', () => {
	beforeEach(() => {
		render(<Home />)
	})

	test('renders board title from JSON in h1 element', () => {
		const boardName = data.boards[0].name
		const titleElement = screen.getByRole('heading', {
			level: 1,
			name: boardName,
		})
		expect(titleElement).toBeInTheDocument()
	})

	test('renders board subtitle text', () => {
		const subtitle = 'Drag cards between columns to update their status'
		expect(screen.getByText(subtitle)).toBeInTheDocument()
	})

	test('renders kanban board container with correct test id', () => {
		const boardContainer = screen.getByTestId('kanban-board')
		expect(boardContainer).toBeInTheDocument()
	})

	test('renders correct number of columns from JSON', () => {
		const expectedColumns = data.boards[0].columns.length
		const renderedColumns = screen.getAllByTestId(/^column-/)
		expect(renderedColumns).toHaveLength(expectedColumns)
	})

	test('renders total number of cards across all columns (should be 8)', () => {
		const renderedCards = screen.getAllByTestId(/^card-/)
		expect(renderedCards).toHaveLength(8)
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
			const columnElement = screen.getByTestId(`column-${column.id}`)
			const countBadge = within(columnElement).getByText(
				column.cards.length.toString(),
			)
			expect(countBadge).toBeInTheDocument()
		})
	})
})

describe('Card Components', () => {
	beforeEach(() => {
		render(<Home />)
	})

	test('renders card title, description, assignee, and due date correctly', () => {
		data.boards[0].columns.forEach((column) => {
			column.cards.forEach((card) => {
				const cardElement = screen.getByTestId(`card-${card.id}`)

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
				const cardElement = screen.getByTestId(`card-${card.id}`)
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
				const cardElement = screen.getByTestId(`card-${card.id}`)

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
				expect(
					screen.getByTestId(`card-${card.id}`),
				).toBeInTheDocument()
			})
		})
	})
})

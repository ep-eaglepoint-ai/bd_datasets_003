import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TextEditorModal from '../components/TextEditorModal'

describe('TextEditorModal', () => {
  const mockOnClose = vi.fn()
  const mockOnSave = vi.fn()

  beforeEach(() => {
    mockOnClose.mockClear()
    mockOnSave.mockClear()
  })

  describe('Initial render and visibility', () => {
    it('should not render when isOpen is false', () => {
      const { container } = render(
        <TextEditorModal isOpen={false} onClose={mockOnClose} onSave={mockOnSave} />
      )
      expect(container.firstChild).toBeNull()
    })

    it('should render when isOpen is true', () => {
      render(<TextEditorModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />)
      expect(screen.getByText('Text Editor (stub)')).toBeInTheDocument()
    })

    it('should display default text value "Sample"', () => {
      render(<TextEditorModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />)
      const textInput = screen.getByDisplayValue('Sample')
      expect(textInput).toBeInTheDocument()
    })

    it('should display default color picker with white color', () => {
      render(<TextEditorModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />)
      const colorInput = screen.getByDisplayValue('#ffffff') as HTMLInputElement
      expect(colorInput).toBeInTheDocument()
      expect(colorInput.type).toBe('color')
    })

    it('should display default font size of 24', () => {
      render(<TextEditorModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />)
      const fontSizeInput = screen.getByDisplayValue('24') as HTMLInputElement
      expect(fontSizeInput).toBeInTheDocument()
      expect(fontSizeInput.type).toBe('number')
    })
  })

  describe('Button interactions', () => {
    it('should have Cancel and Save buttons', () => {
      render(<TextEditorModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />)
      expect(screen.getByText('Cancel')).toBeInTheDocument()
      expect(screen.getByText('Save')).toBeInTheDocument()
    })

    it('should call onClose when Cancel button is clicked', () => {
      render(<TextEditorModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />)
      const cancelButton = screen.getByText('Cancel')
      fireEvent.click(cancelButton)
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('should call onSave with correct parameters when Save is clicked', () => {
      render(<TextEditorModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />)
      const saveButton = screen.getByText('Save')
      fireEvent.click(saveButton)

      expect(mockOnSave).toHaveBeenCalledTimes(1)
      expect(mockOnSave).toHaveBeenCalledWith(
        'Sample',
        { color: '#ffffff', fontSize: 24 },
        50,
        50
      )
    })
  })

  describe('Text input interactions', () => {
    it('should update text when user types', async () => {
      const user = userEvent.setup()
      render(<TextEditorModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />)

      const textInput = screen.getByDisplayValue('Sample')
      await user.clear(textInput)
      await user.type(textInput, 'New text content')

      expect(textInput).toHaveValue('New text content')
    })

    it('should save updated text when Save is clicked after editing', async () => {
      const user = userEvent.setup()
      render(<TextEditorModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />)

      const textInput = screen.getByDisplayValue('Sample')
      await user.clear(textInput)
      await user.type(textInput, 'Updated')

      const saveButton = screen.getByText('Save')
      fireEvent.click(saveButton)

      expect(mockOnSave).toHaveBeenCalledWith(
        'Updated',
        expect.any(Object),
        50,
        50
      )
    })
  })

  describe('Color picker interactions', () => {
    it('should update color when changed', async () => {
      render(<TextEditorModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />)

      const colorInput = screen.getByDisplayValue('#ffffff')
      fireEvent.change(colorInput, { target: { value: '#ff0000' } })

      expect(colorInput).toHaveValue('#ff0000')
    })

    it('should save with updated color', async () => {
      render(<TextEditorModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />)

      const colorInput = screen.getByDisplayValue('#ffffff')
      fireEvent.change(colorInput, { target: { value: '#00ff00' } })

      const saveButton = screen.getByText('Save')
      fireEvent.click(saveButton)

      expect(mockOnSave).toHaveBeenCalledWith(
        'Sample',
        { color: '#00ff00', fontSize: 24 },
        50,
        50
      )
    })
  })

  describe('Font size interactions', () => {
    it('should update font size when changed', async () => {
      render(<TextEditorModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />)

      const fontSizeInput = screen.getByDisplayValue('24')
      fireEvent.change(fontSizeInput, { target: { value: '36' } })

      expect(fontSizeInput).toHaveValue(36)
    })

    it('should save with updated font size', async () => {
      render(<TextEditorModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />)

      const fontSizeInput = screen.getByDisplayValue('24')
      fireEvent.change(fontSizeInput, { target: { value: '48' } })

      const saveButton = screen.getByText('Save')
      fireEvent.click(saveButton)

      expect(mockOnSave).toHaveBeenCalledWith(
        'Sample',
        { color: '#ffffff', fontSize: 48 },
        50,
        50
      )
    })

    it('should handle empty font size input', async () => {
      render(<TextEditorModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />)

      const fontSizeInput = screen.getByDisplayValue('24')
      fireEvent.change(fontSizeInput, { target: { value: '' } })

      const saveButton = screen.getByText('Save')
      fireEvent.click(saveButton)

      // Should default to 24 when empty
      expect(mockOnSave).toHaveBeenCalledWith(
        'Sample',
        { color: '#ffffff', fontSize: 24 },
        50,
        50
      )
    })
  })

  describe('Combined interactions', () => {
    it('should save all updated values together', async () => {
      const user = userEvent.setup()
      render(<TextEditorModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />)

      // Update text
      const textInput = screen.getByDisplayValue('Sample')
      await user.clear(textInput)
      await user.type(textInput, 'Complete Test')

      // Update color
      const colorInput = screen.getByDisplayValue('#ffffff')
      fireEvent.change(colorInput, { target: { value: '#123456' } })

      // Update font size
      const fontSizeInput = screen.getByDisplayValue('24')
      fireEvent.change(fontSizeInput, { target: { value: '32' } })

      // Save
      const saveButton = screen.getByText('Save')
      fireEvent.click(saveButton)

      expect(mockOnSave).toHaveBeenCalledWith(
        'Complete Test',
        { color: '#123456', fontSize: 32 },
        50,
        50
      )
    })
  })

  describe('Focus management', () => {
    it('should have focusable text input', () => {
      render(<TextEditorModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />)
      const textInput = screen.getByDisplayValue('Sample')
      textInput.focus()
      expect(document.activeElement).toBe(textInput)
    })
  })

  describe('Modal structure', () => {
    it('should have correct modal structure when open', () => {
      const { container } = render(
        <TextEditorModal isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />
      )
      const modal = container.firstChild
      expect(modal).toBeInTheDocument()
      expect(screen.getByText('Text Editor (stub)')).toBeInTheDocument()
    })
  })
})

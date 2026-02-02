import React, { useState } from 'react'

export default function TextEditorModal({
  isOpen,
  onClose,
  onSave,
}: {
  isOpen: boolean
  onClose: () => void
  onSave: (text: string, style: any, x: number, y: number) => void
}) {
  const [text, setText] = useState('Sample')
  const [color, setColor] = useState('#ffffff')
  const [fontSize, setFontSize] = useState(24)

  if (!isOpen) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div style={{ background: 'white', padding: 16, borderRadius: 8, width: 360 }}>
        <h3>Text Editor (stub)</h3>
        <div style={{ marginTop: 8 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          <input type="number" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value || '24'))} />
        </div>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose}>Cancel</button>
          <button onClick={() => onSave(text, { color, fontSize }, 50, 50)}>Save</button>
        </div>
      </div>
    </div>
  )
}

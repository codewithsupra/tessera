import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Modal } from './Modal'

// jsdom lacks showModal/close; give it the minimal behavior (close fires a 'close' event).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

function Harness() {
  const [open, setOpen] = useState(false)
  const [opens, setOpens] = useState(0)
  return (
    <>
      <button onClick={() => (setOpen(true), setOpens((n) => n + 1))}>open</button>
      <span>opens:{opens}</span>
      <Modal open={open} onClose={() => setOpen(false)} title="Members">
        <p>content</p>
      </Modal>
    </>
  )
}

describe('Modal', () => {
  it('reopens after being closed natively (Escape)', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open'))
    expect(screen.getByText('content')).toBeInTheDocument()
    const dialog = document.querySelector('dialog')!
    act(() => dialog.close()) // what the browser does on Escape
    expect(screen.queryByText('content')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('open'))
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('closes from the close button and the backdrop', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('open'))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText('content')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('open'))
    fireEvent.click(document.querySelector('dialog')!)
    expect(screen.queryByText('content')).not.toBeInTheDocument()
  })
})

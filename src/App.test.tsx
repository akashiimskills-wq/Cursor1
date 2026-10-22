import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('PeopleFlow', () => {
  it('navigates to the employee directory and filters employees', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Employees' }))

    expect(screen.getByRole('heading', { name: 'Employee directory' })).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Search employees...'), { target: { value: 'Jackson' } })

    expect(screen.getByText('Jackson Lee')).toBeInTheDocument()
    expect(screen.queryByText('Olivia Martin')).not.toBeInTheDocument()
  })

  it('adds a new employee', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /add employee/i }))
    fireEvent.click(screen.getByRole('button', { name: /add employee/i }))
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Maya Patel' } })
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Product Manager' } })
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'maya@example.com' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add employee' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: 'Employees' }))

    expect(screen.getByText('Maya Patel')).toBeInTheDocument()
  })

  it('approves a pending leave request', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Leave/ }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0])

    expect(screen.getAllByText('Approved')).toHaveLength(2)
  })
})

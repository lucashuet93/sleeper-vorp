import { render, screen } from '@testing-library/react'
import App from './App.jsx'

test('renders the application', () => {
  render(<App />)

  expect(screen.getByRole('heading', { name: 'Sleeper VORP' })).toBeTruthy()
})

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChoiceInput } from './ChoiceInput'

const TF = ['True', 'False']
const SYMBOLS = ['>', '=', '<']

const options = () => screen.getAllByRole('radio')
const commit = () => screen.getByTestId('choice-submit')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance'] })
})

describe('ChoiceInput', () => {
  it('shows the question and every option, in the order given', () => {
    render(<ChoiceInput prompt="Is 348 a multiple of 6?" options={SYMBOLS} onSubmit={() => {}} />)
    expect(screen.getByText('Is 348 a multiple of 6?')).toBeInTheDocument()
    expect(options().map((o) => o.textContent)).toEqual(SYMBOLS)
  })

  it('takes two taps: choose, then commit', () => {
    // Not one-tap-commit. This is the only screen where a slip of the thumb
    // could otherwise end a possession outright.
    const onSubmit = vi.fn()
    render(<ChoiceInput prompt="p" options={TF} onSubmit={onSubmit} />)

    fireEvent.click(options()[0]!)
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.click(commit())
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0]![0]).toBe('True')
  })

  it('lets him change his mind before committing', () => {
    const onSubmit = vi.fn()
    render(<ChoiceInput prompt="p" options={SYMBOLS} onSubmit={onSubmit} />)

    fireEvent.click(options()[0]!)
    fireEvent.click(options()[2]!)
    fireEvent.click(commit())

    expect(onSubmit.mock.calls[0]![0]).toBe('<')
  })

  it('marks exactly one option as chosen', () => {
    render(<ChoiceInput prompt="p" options={SYMBOLS} onSubmit={() => {}} />)
    expect(options().filter((o) => o.getAttribute('aria-checked') === 'true')).toHaveLength(0)

    fireEvent.click(options()[1]!)
    const checked = options().filter((o) => o.getAttribute('aria-checked') === 'true')
    expect(checked).toHaveLength(1)
    expect(checked[0]!.textContent).toBe('=')
  })

  it('costs nothing to commit with nothing chosen', () => {
    // The numpad's rule, kept: no attempt, no error, no red.
    const onSubmit = vi.fn()
    render(<ChoiceInput prompt="p" options={TF} onSubmit={onSubmit} />)

    fireEvent.click(commit())
    expect(onSubmit).not.toHaveBeenCalled()
    expect(commit()).toBeDisabled()
  })

  it('hands back the option text exactly, so the checker can match it', () => {
    const onSubmit = vi.fn()
    render(<ChoiceInput prompt="p" options={['7/8', '  spaced  ']} onSubmit={onSubmit} />)
    fireEvent.click(options()[1]!)
    fireEvent.click(commit())
    expect(onSubmit.mock.calls[0]![0]).toBe('  spaced  ')
  })

  it('measures how long the answer took', () => {
    const onSubmit = vi.fn()
    render(<ChoiceInput prompt="p" options={TF} onSubmit={onSubmit} />)

    vi.advanceTimersByTime(1500)
    fireEvent.click(options()[0]!)
    vi.advanceTimersByTime(500)
    fireEvent.click(commit())

    expect(onSubmit.mock.calls[0]![1]).toBeGreaterThanOrEqual(2000)
  })

  it('answers from the keyboard, because one iPad has one', () => {
    const onSubmit = vi.fn()
    render(<ChoiceInput prompt="p" options={SYMBOLS} onSubmit={onSubmit} />)

    const group = screen.getByTestId('choices')
    fireEvent.keyDown(group, { key: '3' })
    expect(options()[2]!.getAttribute('aria-checked')).toBe('true')

    fireEvent.keyDown(group, { key: 'Enter' })
    expect(onSubmit.mock.calls[0]![0]).toBe('<')
  })

  it('ignores a digit with no option behind it', () => {
    const onSubmit = vi.fn()
    render(<ChoiceInput prompt="p" options={TF} onSubmit={onSubmit} />)

    const group = screen.getByTestId('choices')
    fireEvent.keyDown(group, { key: '7' })
    fireEvent.keyDown(group, { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does nothing at all while disabled', () => {
    const onSubmit = vi.fn()
    render(<ChoiceInput prompt="p" options={TF} onSubmit={onSubmit} disabled />)

    fireEvent.click(options()[0]!)
    fireEvent.keyDown(screen.getByTestId('choices'), { key: '1' })
    fireEvent.keyDown(screen.getByTestId('choices'), { key: 'Enter' })
    fireEvent.click(commit())

    expect(onSubmit).not.toHaveBeenCalled()
    expect(options()[0]!).toBeDisabled()
  })

  it('clears the selection after answering, so the next question starts empty', () => {
    const onSubmit = vi.fn()
    render(<ChoiceInput prompt="p" options={TF} onSubmit={onSubmit} />)

    fireEvent.click(options()[0]!)
    fireEvent.click(commit())

    expect(options().filter((o) => o.getAttribute('aria-checked') === 'true')).toHaveLength(0)
    expect(commit()).toBeDisabled()
  })

  it('never shows a clock or anything that reads as one', () => {
    render(<ChoiceInput prompt="Is 8 even?" options={TF} onSubmit={() => {}} />)
    expect(screen.queryByRole('timer')).toBeNull()
    const said = document.body.textContent ?? ''
    for (const pattern of [/time left/i, /seconds/i, /\d{1,2}:\d{2}/]) {
      expect(said).not.toMatch(pattern)
    }
  })

  it('says nothing about whether an option is right', () => {
    render(<ChoiceInput prompt="Is 8 even?" options={TF} onSubmit={() => {}} />)
    const said = document.body.textContent ?? ''
    for (const pattern of [/correct/i, /wrong/i, /incorrect/i, /[✓✔✗✘]/]) {
      expect(said).not.toMatch(pattern)
    }
  })
})

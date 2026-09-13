import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QuestionInput } from './QuestionInput'

const field = (): HTMLInputElement => screen.getByRole('textbox')
const key = (name: string) => screen.getByRole('button', { name })

/**
 * A clock we own.
 *
 * `performance.now` is spied with an implementation rather than with queued
 * return values because React's scheduler reads the same clock, and a queue
 * would hand the component whatever was left after React had helped itself.
 */
function fakeClock(): { set: (ms: number) => void } {
  let at = 0
  vi.spyOn(performance, 'now').mockImplementation(() => at)
  return {
    set: (ms: number) => {
      at = ms
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('QuestionInput', () => {
  it('focuses itself, so a hardware keyboard works without a tap first', () => {
    render(<QuestionInput prompt="7 × 8 = ?" onSubmit={vi.fn()} />)
    expect(field()).toHaveFocus()
  })

  it('submits what was typed when Enter is pressed', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<QuestionInput prompt="7 × 8 = ?" onSubmit={onSubmit} />)

    await user.type(field(), '56{Enter}')

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0]![0]).toBe('56')
  })

  it('hands the caller the raw string, unnormalised and unfiltered', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<QuestionInput prompt="What is the difference?" onSubmit={onSubmit} />)

    // A unicode minus and a division sign are exactly what an iPad produces.
    // Stripping them here would take the answer away before `normaliseInput`
    // ever got the chance to understand it.
    fireEvent.change(field(), { target: { value: '−1÷2' } })
    await user.keyboard('{Enter}')

    expect(onSubmit.mock.calls[0]![0]).toBe('−1÷2')
  })

  it('costs nothing when Enter is pressed with an empty box', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<QuestionInput prompt="7 × 8 = ?" onSubmit={onSubmit} />)

    await user.keyboard('{Enter}{Enter}{Enter}')

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('costs nothing when the submit key is tapped with an empty box', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<QuestionInput prompt="7 × 8 = ?" onSubmit={onSubmit} />)

    await user.click(key('Submit answer'))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('will not submit whitespace either', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<QuestionInput prompt="7 × 8 = ?" onSubmit={onSubmit} />)

    fireEvent.change(field(), { target: { value: '   ' } })
    await user.keyboard('{Enter}')

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('types digits from the on-screen numpad', async () => {
    const user = userEvent.setup()
    render(<QuestionInput prompt="7 × 8 = ?" onSubmit={vi.fn()} />)

    await user.click(key('5'))
    await user.click(key('6'))

    expect(field()).toHaveValue('56')
  })

  it('offers the symbols a fraction, a decimal and a negative need', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<QuestionInput prompt="What is the answer?" onSubmit={onSubmit} />)

    await user.click(key('Minus'))
    await user.click(key('3'))
    await user.click(key('Fraction bar'))
    await user.click(key('4'))
    await user.click(key('Decimal point'))
    await user.click(key('Submit answer'))

    expect(onSubmit.mock.calls[0]![0]).toBe('-3/4.')
  })

  it('deletes the last character with backspace', async () => {
    const user = userEvent.setup()
    render(<QuestionInput prompt="7 × 8 = ?" onSubmit={vi.fn()} />)

    await user.click(key('5'))
    await user.click(key('6'))
    await user.click(key('Backspace'))

    expect(field()).toHaveValue('5')
  })

  it('submits from the numpad exactly as Enter does', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<QuestionInput prompt="7 × 8 = ?" onSubmit={onSubmit} />)

    await user.click(key('5'))
    await user.click(key('6'))
    await user.click(key('Submit answer'))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0]![0]).toBe('56')
  })

  it('measures latency silently, from mount to submit', async () => {
    const clock = fakeClock()
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<QuestionInput prompt="7 × 8 = ?" onSubmit={onSubmit} />)

    clock.set(4200)
    await user.type(field(), '56{Enter}')

    expect(onSubmit.mock.calls[0]![1]).toBe(4200)
  })

  it('restarts the clock after a submit, so one instance can take two questions', async () => {
    const clock = fakeClock()
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<QuestionInput prompt="7 × 8 = ?" onSubmit={onSubmit} />)

    clock.set(1000)
    await user.type(field(), '56{Enter}')
    clock.set(1750)
    await user.type(field(), '42{Enter}')

    expect(onSubmit.mock.calls[1]![1]).toBe(750)
  })

  it('empties itself after a submit, so the next answer starts clean', async () => {
    const user = userEvent.setup()
    render(<QuestionInput prompt="7 × 8 = ?" onSubmit={vi.fn()} />)

    await user.type(field(), '56{Enter}')

    expect(field()).toHaveValue('')
    expect(field()).toHaveFocus()
  })

  it('keeps what he typed when the caller says it could not read it', async () => {
    // A re-prompt used to arrive at an empty box, so `7 r 2` had to be typed
    // again from the start to become `7`. The one character he needs to fix
    // is still there now, and the clock keeps running on the same question.
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockReturnValueOnce(false).mockReturnValue(undefined)
    render(<QuestionInput prompt="15 ÷ 2 = ?" onSubmit={onSubmit} />)

    await user.type(field(), '7 r 1{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('7 r 1', expect.any(Number))
    expect(field()).toHaveValue('7 r 1')
    expect(field()).toHaveFocus()

    await user.clear(field())
    await user.type(field(), '7{Enter}')
    expect(onSubmit).toHaveBeenLastCalledWith('7', expect.any(Number))
    expect(field()).toHaveValue('')
  })

  it('renders no countdown of any kind', () => {
    vi.useFakeTimers()
    const { container } = render(<QuestionInput prompt="7 × 8 = ?" onSubmit={vi.fn()} />)
    const before = container.textContent

    // Unfinished timed work cost this child recess. Nothing in this component
    // may count down, so five seconds of sitting still must change nothing on
    // screen at all.
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(container.textContent).toBe(before)
    expect(container.querySelector('[role="timer"]')).toBeNull()
    expect(container.textContent).not.toMatch(/left|remaining|seconds|time/i)
  })

  it('puts the answer box inside the expression when the item asks for it', () => {
    render(
      <QuestionInput
        prompt="1/3 = ?/18. What is the missing top number?"
        promptWithSlot="1/3 = {}/18"
        onSubmit={vi.fn()}
      />,
    )

    // The box sits above `/18` rather than after the sentence, so that "6/18"
    // — correct mathematics, wrong answer to the question asked — is not the
    // natural thing to type.
    const slot = screen.getByTestId('answer-slot')
    expect(slot.textContent).toBe('1/3 = /18')
    expect(slot).toContainElement(field())
  })

  it('keeps the whole question on screen when the box is inline', () => {
    render(
      <QuestionInput
        prompt="1/3 = ?/18. What is the missing top number?"
        promptWithSlot="1/3 = {}/18"
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByText('1/3 = ?/18. What is the missing top number?')).toBeInTheDocument()
    expect(field()).toHaveAccessibleName('1/3 = ?/18. What is the missing top number?')
  })

  it('puts the box below the question when the item does not ask for a slot', () => {
    render(<QuestionInput prompt="7 × 8 = ?" onSubmit={vi.fn()} />)

    expect(screen.queryByTestId('answer-slot')).toBeNull()
    expect(screen.getByText('7 × 8 = ?')).toBeInTheDocument()
    expect(field()).toHaveAccessibleName('7 × 8 = ?')
  })

  it('takes no answer at all while the caller has it locked', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<QuestionInput prompt="7 × 8 = ?" onSubmit={onSubmit} disabled />)

    await user.click(key('5'))
    await user.click(key('Submit answer'))
    fireEvent.change(field(), { target: { value: '56' } })
    fireEvent.keyDown(field(), { key: 'Enter' })

    expect(onSubmit).not.toHaveBeenCalled()
  })
})

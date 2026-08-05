import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TackleBack } from './TackleBack'

const MS = 6500

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const said = (): string => document.body.textContent ?? ''

const classNames = (): string[] =>
  [...document.querySelectorAll('*')].flatMap((el) =>
    (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => c.length > 0),
  )

const wait = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('TackleBack', () => {
  it('shows a visible bar while the ball is loose', () => {
    render(<TackleBack ms={MS} timed onExpire={() => {}} />)
    expect(screen.getByTestId('tackleback-bar')).toBeInTheDocument()
  })

  it('hands the ball on when the bar runs out', () => {
    const onExpire = vi.fn()
    render(<TackleBack ms={MS} timed onExpire={onExpire} />)

    wait(MS - 1)
    expect(onExpire).not.toHaveBeenCalled()

    wait(1)
    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it('never fires twice, however long the screen is left up', () => {
    const onExpire = vi.fn()
    render(<TackleBack ms={MS} timed onExpire={onExpire} />)

    wait(MS * 10)
    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it('draws no bar at all and never expires when timers are off', () => {
    const onExpire = vi.fn()
    render(<TackleBack ms={MS} timed={false} onExpire={onExpire} />)

    expect(screen.queryByTestId('tackleback-bar')).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()

    wait(MS * 20)
    expect(onExpire).not.toHaveBeenCalled()
  })

  it('says out loud that running out cannot cost him anything', () => {
    render(<TackleBack ms={MS} timed onExpire={() => {}} />)
    expect(said()).toMatch(/already loose/i)
    expect(said()).toMatch(/can’t take|cannot take/i)
  })

  it('tells him to take his time when the clock is off', () => {
    render(<TackleBack ms={MS} timed={false} onExpire={() => {}} />)
    expect(said()).toMatch(/take as long as you like/i)
    expect(said()).not.toMatch(/clock|timer|seconds/i)
  })

  it('is calm: no countdown, no numbers, no alarm', () => {
    render(<TackleBack ms={MS} timed onExpire={() => {}} />)
    expect(said()).not.toMatch(/\d/)
    expect(said()).not.toMatch(/hurry|quick(ly)?|fast|running out|left\b/i)
    expect(said()).not.toMatch(/\bwrong\b|\blost\b|\bfail(ed|ure)?\b/i)
    expect(classNames().filter((c) => /red|rose|crimson|amber-6|orange/i.test(c))).toEqual([])
  })
})

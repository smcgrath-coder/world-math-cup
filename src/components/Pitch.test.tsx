import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Pitch, SPOT_X, ballSpot } from './Pitch'
import type { BallState } from './Pitch'

const OURS = { name: 'Rionia', kit: ['#fbbf24', '#14532d'] as const }
const THEIRS = { name: 'Brazil', kit: ['#FEDD00', '#009C3B'] as const }

function draw(ball: BallState, still = true) {
  return render(
    <Pitch
      ball={ball}
      still={still}
      ourName={OURS.name}
      ourKit={OURS.kit}
      theirName={THEIRS.name}
      theirKit={THEIRS.kit}
    />,
  )
}

const ballX = (): number => Number(screen.getByTestId('ball').getAttribute('data-x'))

describe('ballSpot', () => {
  it('reads the ball straight off possession and zone', () => {
    expect(ballSpot({ zone: 'own_third', possession: 'us' })).toBe('own_third')
    expect(ballSpot({ zone: 'midfield', possession: 'us' })).toBe('midfield')
    expect(ballSpot({ zone: 'final_third', possession: 'us' })).toBe('final_third')
  })

  it('puts the ball on the shooting spot once a shot is being taken', () => {
    expect(ballSpot({ zone: 'final_third', possession: 'us', shooting: true })).toBe('shot')
  })

  it('drops the ball back into our own half when they have it', () => {
    expect(ballSpot({ zone: 'own_third', possession: 'them' })).toBe('their_attack')
    // Their kickoff, which is the one time they hold it on the halfway line.
    expect(ballSpot({ zone: 'midfield', possession: 'them' })).toBe('midfield')
  })

  it('runs left to right, so advancing always moves the ball forward', () => {
    expect(SPOT_X.their_attack).toBeLessThan(SPOT_X.own_third)
    expect(SPOT_X.own_third).toBeLessThan(SPOT_X.midfield)
    expect(SPOT_X.midfield).toBeLessThan(SPOT_X.final_third)
    expect(SPOT_X.final_third).toBeLessThan(SPOT_X.shot)
  })
})

describe('Pitch', () => {
  it('advances the ball up the pitch as the zone advances', () => {
    const { rerender } = draw({ zone: 'own_third', possession: 'us' })
    const back = ballX()

    rerender(
      <Pitch
        ball={{ zone: 'midfield', possession: 'us' }}
        still
        ourName={OURS.name}
        ourKit={OURS.kit}
        theirName={THEIRS.name}
        theirKit={THEIRS.kit}
      />,
    )
    expect(ballX()).toBeGreaterThan(back)
  })

  it('says who has the ball, in words as well as in colour', () => {
    draw({ zone: 'own_third', possession: 'us' })
    expect(screen.getByTestId('possession')).toHaveTextContent(/you/i)

    draw({ zone: 'own_third', possession: 'them' })
    expect(screen.getAllByTestId('possession').at(-1)).toHaveTextContent(/brazil/i)
  })

  it('shows a loose ball as nobody’s during a tackle-back', () => {
    draw({ zone: 'final_third', possession: 'us', shooting: true, loose: true })

    expect(screen.getByTestId('possession')).toHaveTextContent(/loose/i)
    // Still exactly where it was — a loose ball has not gone anywhere.
    expect(Number(screen.getByTestId('ball').getAttribute('data-x'))).toBe(SPOT_X.shot)
  })

  it('draws a football pitch rather than a progress bar', () => {
    draw({ zone: 'midfield', possession: 'us' })
    expect(screen.getByTestId('centre-circle')).toBeInTheDocument()
    expect(screen.getByTestId('penalty-area-ours')).toBeInTheDocument()
    expect(screen.getByTestId('penalty-area-theirs')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('holds everything still while a question is live', () => {
    draw({ zone: 'midfield', possession: 'us' }, true)
    expect(screen.getByTestId('pitch')).toHaveAttribute('data-still', 'true')
    expect(screen.getByTestId('ball')).toHaveAttribute('data-moving', 'false')
  })

  it('moves in the gap between questions', () => {
    draw({ zone: 'midfield', possession: 'us' }, false)
    expect(screen.getByTestId('pitch')).toHaveAttribute('data-still', 'false')
    expect(screen.getByTestId('ball')).toHaveAttribute('data-moving', 'true')
  })
})

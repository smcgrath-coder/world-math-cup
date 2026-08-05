import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SHOT_OPTIONS, ShotMenu } from './ShotMenu'
import type { ShotChoice } from '../store/types'

const said = (): string => document.body.textContent ?? ''

describe('ShotMenu', () => {
  it('offers all four shots, easiest first', () => {
    render(<ShotMenu onChoose={() => {}} />)

    expect(SHOT_OPTIONS.map((o) => o.shot)).toEqual<ShotChoice[]>([
      'wide',
      'box',
      'outside18',
      'bicycle',
    ])
    for (const option of SHOT_OPTIONS) {
      expect(screen.getByRole('button', { name: new RegExp(option.title, 'i') })).toBeInTheDocument()
    }
  })

  it('hands the choice straight back', () => {
    const onChoose = vi.fn()
    render(<ShotMenu onChoose={onChoose} />)

    fireEvent.click(screen.getByRole('button', { name: /bicycle kick/i }))
    expect(onChoose).toHaveBeenCalledWith<[ShotChoice]>('bicycle')
  })

  it('says out loud that the hard two count whether or not they go in', () => {
    render(<ShotMenu onChoose={() => {}} />)

    const hard = SHOT_OPTIONS.filter((o) => o.brave)
    expect(hard.map((o) => o.shot)).toEqual<ShotChoice[]>(['outside18', 'bicycle'])
    expect(said()).toMatch(/whether (they|it) go(es)? in or not|in or out/i)
  })

  it('labels the trade honestly without ever warning him off the hard one', () => {
    render(<ShotMenu onChoose={() => {}} />)

    // Harder is described as harder — that is the honest bit — but nothing here
    // suggests he should not, or that missing one is a mistake.
    expect(said()).toMatch(/hard/i)
    expect(said()).not.toMatch(/\brisk(y|ier)?\b|\bunlikely\b|\bshow off\b|\bgreedy\b/i)
    expect(said()).not.toMatch(/\bwrong\b|\bfail(ed|ure)?\b|\bwaste\b/i)
  })
})

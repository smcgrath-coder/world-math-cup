import { fireEvent, screen } from '@testing-library/react'

/**
 * Give an answer to whatever question is on screen, without caring how it is
 * asked.
 *
 * Every screen test used to reach straight for `getByRole('textbox')`, which
 * silently encoded "questions are typed" into a dozen files. The first generator
 * to emit a choice took all of them out at once.
 *
 * So this is the child's-eye view: he is given a question and an answer, and how
 * he delivers it is the screen's business. A typed answer goes in the box; a
 * picked one finds the option with that exact text and commits it.
 *
 * Deliberately throws when a choice has no option matching `given`. A test that
 * meant to answer `5/8` and silently did nothing would pass for the wrong
 * reason, which is worse than failing.
 */
export function giveAnswer(given: string): void {
  const box = screen.queryByRole('textbox')
  if (box !== null) {
    fireEvent.change(box, { target: { value: given } })
    fireEvent.keyDown(box, { key: 'Enter' })
    return
  }

  const options = screen.getAllByRole('radio')
  const wanted = options.find((option) => option.textContent === given)
  if (wanted === undefined) {
    const offered = options.map((option) => option.textContent).join(' | ')
    throw new Error(`no option "${given}" on screen; offered: ${offered}`)
  }

  fireEvent.click(wanted)
  fireEvent.click(screen.getByTestId('choice-submit'))
}

/**
 * Answer in order to get past the question, when *what* was answered does not
 * matter to the test.
 *
 * Several tests pass a throwaway value — `'7'`, or a deliberately impossible
 * `'-1'` — because all they need is a session that advances. A typed box takes
 * anything, but a set of options only takes what it offers, so those fall back
 * to the first option rather than throwing.
 *
 * Use `giveAnswer` wherever the test does care, which is most of them. Falling
 * back silently is only safe when the test is not asserting on correctness.
 */
export function giveAnyAnswer(preferred: string): void {
  const box = screen.queryByRole('textbox')
  if (box !== null) {
    fireEvent.change(box, { target: { value: preferred } })
    fireEvent.keyDown(box, { key: 'Enter' })
    return
  }

  const options = screen.getAllByRole('radio')
  const wanted = options.find((option) => option.textContent === preferred) ?? options[0]!
  fireEvent.click(wanted)
  fireEvent.click(screen.getByTestId('choice-submit'))
}

/** Whether the question on screen is answered by picking rather than typing. */
export const isChoiceOnScreen = (): boolean => screen.queryByRole('textbox') === null

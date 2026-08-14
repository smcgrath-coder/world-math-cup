import { ChoiceInput } from './ChoiceInput'
import { QuestionInput } from './QuestionInput'
import type { Item } from '../engine/items/types'

/**
 * Whichever input this item needs.
 *
 * One dispatcher rather than the same branch written into the try-out, the
 * training ground and the match. Three copies would be three places for a new
 * answer kind to be forgotten, and the one that got forgotten would show a child
 * a numpad under a question with no number in it.
 *
 * Both inputs report `(given, latencyMs)` and take `disabled`, so a caller only
 * has to know it is asking a question — not what shape the answer is.
 */
export interface AnswerInputProps {
  item: Item
  onSubmit: (given: string, latencyMs: number) => void
  disabled?: boolean
}

export function AnswerInput({ item, onSubmit, disabled }: AnswerInputProps) {
  if (item.answer.kind === 'choice') {
    return (
      <ChoiceInput
        prompt={item.prompt}
        options={item.answer.options}
        onSubmit={onSubmit}
        disabled={disabled}
      />
    )
  }

  return (
    <QuestionInput
      prompt={item.prompt}
      promptWithSlot={item.promptWithSlot}
      onSubmit={onSubmit}
      disabled={disabled}
    />
  )
}

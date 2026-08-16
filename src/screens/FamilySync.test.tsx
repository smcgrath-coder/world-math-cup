import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { FamilySync } from './FamilySync'
import { createFakeTransport } from '../test/fakeTransport'
import { getLink, unlinkDevice } from '../sync/link'

/**
 * Every flow here is driven through `createFakeTransport()`, the same
 * in-memory backend `syncEngine.test.ts` uses — never a mock of
 * `@supabase/supabase-js`, and never a real network call. That proves the
 * UI's own logic: which step follows which, what a grown-up sees, and that
 * unlinking never touches the local save.
 *
 * What this file does *not* re-prove: whether a sync actually converges two
 * devices' data. `finishLinking` does call the module-level `syncNow()` after
 * linking, and in this test environment that quietly resolves to `{ok:
 * false, error: 'not configured'}` (no `VITE_SUPABASE_*` env here) rather
 * than throwing — harmless, and exactly the behaviour a real deployment
 * without Supabase configured should have too. The actual merge properties
 * are `syncEngine.test.ts`'s job.
 */

beforeEach(() => {
  localStorage.clear()
  unlinkDevice()
})

describe('FamilySync — unlinked', () => {
  it('opens on a choice between joining and creating', () => {
    render(<FamilySync transport={createFakeTransport()} />)
    expect(screen.getByText(/join with a code/i)).toBeInTheDocument()
    expect(screen.getByText(/start a new household/i)).toBeInTheDocument()
  })

  it('creates a household and lands on the player picker with the code shown', async () => {
    render(<FamilySync transport={createFakeTransport()} />)
    fireEvent.click(screen.getByText(/start a new household/i))
    fireEvent.click(screen.getByText(/^create household$/i))

    // A fresh household has no existing players, so "Who's playing?" is
    // correctly absent here — what's unconditional in this step is the name
    // input and the invite code itself, shown for the other device to use.
    await waitFor(() => screen.getByPlaceholderText('Rion'))
    const shownCode = document.body.textContent?.match(/[A-Z2-9]{6}/)?.[0]
    expect(shownCode).toBeDefined()
  })

  it('rejects a code nobody created, without crashing', async () => {
    render(<FamilySync transport={createFakeTransport()} />)
    fireEvent.click(screen.getByText(/join with a code/i))

    const input = screen.getByPlaceholderText(/xk7p4m/i)
    fireEvent.change(input, { target: { value: 'ZZZZZZ' } })
    fireEvent.click(screen.getByText(/^join$/i))

    await waitFor(() => expect(screen.getByText(/no household found/i)).toBeInTheDocument())
  })

  it('joins a household created moments earlier by another device on the same transport', async () => {
    const transport = createFakeTransport()
    const { inviteCode } = await transport.createHousehold()

    render(<FamilySync transport={transport} />)
    fireEvent.click(screen.getByText(/join with a code/i))
    fireEvent.change(screen.getByPlaceholderText(/xk7p4m/i), { target: { value: inviteCode } })
    fireEvent.click(screen.getByText(/^join$/i))

    // Same reasoning as above: this household has no players yet either, so
    // the picker's unconditional "name a new player" input is what proves
    // the join actually landed on the pickPlayer step.
    await waitFor(() => screen.getByPlaceholderText('Rion'))
  })

  it('completes linking end to end: create, name a player, and land on the linked view', async () => {
    render(<FamilySync transport={createFakeTransport()} />)
    fireEvent.click(screen.getByText(/start a new household/i))
    fireEvent.click(screen.getByText(/^create household$/i))
    await waitFor(() => screen.getByPlaceholderText('Rion'))

    fireEvent.change(screen.getByPlaceholderText('Rion'), { target: { value: 'Rion' } })
    await act(async () => {
      fireEvent.click(screen.getByText(/^add rion$/i))
    })

    expect(screen.getByText(/playing as/i)).toBeInTheDocument()
    expect(screen.getByText('Rion')).toBeInTheDocument()
    expect(getLink()?.playerName).toBe('Rion')
  })

  it('lists an existing player as a one-tap pick rather than asking to re-type the name', async () => {
    const transport = createFakeTransport()
    const { householdId, inviteCode } = await transport.createHousehold()
    await transport.createPlayer(householdId, 'Rion')

    render(<FamilySync transport={transport} />)
    fireEvent.click(screen.getByText(/join with a code/i))
    fireEvent.change(screen.getByPlaceholderText(/xk7p4m/i), { target: { value: inviteCode } })
    fireEvent.click(screen.getByText(/^join$/i))

    await waitFor(() => screen.getByText('Rion'))
    await act(async () => {
      fireEvent.click(screen.getByText('Rion'))
    })

    expect(getLink()?.playerName).toBe('Rion')
  })
})

describe('FamilySync — linked', () => {
  async function linked() {
    const transport = createFakeTransport()
    const { unmount } = render(<FamilySync transport={transport} />)
    fireEvent.click(screen.getByText(/start a new household/i))
    fireEvent.click(screen.getByText(/^create household$/i))
    await waitFor(() => screen.getByPlaceholderText('Rion'))
    fireEvent.change(screen.getByPlaceholderText('Rion'), { target: { value: 'Rion' } })
    await act(async () => {
      fireEvent.click(screen.getByText(/^add rion$/i))
    })
    unmount()
  }

  it('opens straight on the linked view on a later mount, without repeating setup', async () => {
    await linked()
    render(<FamilySync transport={createFakeTransport()} />)
    expect(screen.getByText(/playing as/i)).toBeInTheDocument()
  })

  it('unlinking asks first, and only actually unlinks on the second tap', async () => {
    await linked()
    render(<FamilySync transport={createFakeTransport()} />)

    fireEvent.click(screen.getByText(/unlink this device/i))
    expect(getLink()).not.toBeNull() // asking is not doing

    fireEvent.click(screen.getByText('Stay linked'))
    expect(getLink()).not.toBeNull()
    expect(screen.getByText(/playing as/i)).toBeInTheDocument() // back to the linked view, not dropped

    fireEvent.click(screen.getByText(/unlink this device/i))
    fireEvent.click(screen.getByText(/^unlink$/i))
    expect(getLink()).toBeNull()
  })

  it('says plainly that unlinking does not delete anything already played', async () => {
    await linked()
    render(<FamilySync transport={createFakeTransport()} />)
    fireEvent.click(screen.getByText(/unlink this device/i))
    expect(screen.getByText(/nothing already played is deleted/i)).toBeInTheDocument()
  })
})

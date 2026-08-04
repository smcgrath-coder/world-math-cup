import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CountryCreator } from './CountryCreator'
import { getStore, resetStoreForTest } from '../store/storage'
import { PALETTE, contrastRatio } from '../country/flag'

beforeEach(() => {
  localStorage.clear()
  resetStoreForTest()
})

const hexOf = (name: string): string => PALETTE.find((c) => c.name === name)!.hex

/** The SVG the browser is actually being handed for the big preview. */
function preview(): string {
  const src = screen.getByRole('img', { name: 'Your flag' }).getAttribute('src') ?? ''
  return decodeURIComponent(src.replace(/^data:image\/svg\+xml,/, ''))
}

const swatches = (group: string) => within(screen.getByRole('group', { name: group }))

/** Fill in a usable name, since only the name needs typing. */
async function named(user: ReturnType<typeof userEvent.setup>, name = 'Riondia'): Promise<void> {
  await user.type(screen.getByLabelText('Country name'), name)
}

describe('CountryCreator', () => {
  it('opens on a flag rather than on a blank canvas', () => {
    render(<CountryCreator />)
    // A child who taps straight through should still leave with something he
    // likes, so the screen starts on a real flag rather than on nothing.
    expect(preview()).toContain('<svg ')
    expect(screen.getByRole('img', { name: 'Your crest' })).toBeInTheDocument()
  })

  it('offers every step of the flow', () => {
    render(<CountryCreator />)
    expect(screen.getByLabelText('Country name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stripes' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Top' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bear' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Kit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Take the field' })).toBeInTheDocument()
  })

  it('changes the preview when the flag shape changes', async () => {
    const user = userEvent.setup()
    render(<CountryCreator />)
    const before = preview()
    await user.click(screen.getByRole('button', { name: 'X Cross' }))
    expect(preview()).not.toBe(before)
    expect(screen.getByRole('button', { name: 'X Cross' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('changes the preview when a colour changes', async () => {
    const user = userEvent.setup()
    render(<CountryCreator />)
    await user.click(swatches('Top').getByRole('button', { name: 'Red' }))
    expect(preview()).toContain(hexOf('Red'))
  })

  it('renames the colour slots to match the shape he picked', async () => {
    const user = userEvent.setup()
    render(<CountryCreator />)
    expect(screen.getByRole('group', { name: 'Top' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cross' }))
    expect(screen.queryByRole('group', { name: 'Top' })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Cross' })).toBeInTheDocument()
  })

  it('shows one colour slot for a plain flag, not three that do nothing', async () => {
    const user = userEvent.setup()
    render(<CountryCreator />)
    await user.click(screen.getByRole('button', { name: 'Plain' }))
    expect(screen.getByRole('group', { name: 'Colour' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Middle' })).not.toBeInTheDocument()
  })

  it('changes the preview when the badge changes', async () => {
    const user = userEvent.setup()
    render(<CountryCreator />)
    const before = preview()
    await user.click(screen.getByRole('button', { name: 'Trophy' }))
    expect(preview()).not.toBe(before)
  })

  it('will not offer a badge colour that would vanish into the flag', async () => {
    const user = userEvent.setup()
    render(<CountryCreator />)
    await user.click(swatches('Middle').getByRole('button', { name: 'Red' }))
    const offered = swatches('Badge colour')
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? '')
    for (const name of offered) {
      expect(contrastRatio(hexOf(name), hexOf('Red')), name).toBeGreaterThanOrEqual(3)
    }
    expect(offered.length).toBeGreaterThan(0)
  })

  it('keeps the badge visible when he recolours the flag underneath it', async () => {
    const user = userEvent.setup()
    render(<CountryCreator />)
    // The default badge is a navy star on the gold band. Make that band black
    // and the star would sink into it, so the badge colour has to move with the
    // field rather than wait to be noticed.
    expect(contrastRatio(hexOf('Navy'), hexOf('Black'))).toBeLessThan(3)
    await user.click(swatches('Middle').getByRole('button', { name: 'Black' }))

    const badge = swatches('Badge colour')
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-pressed') === 'true')
    expect(badge).toBeDefined()
    const chosen = hexOf(badge!.getAttribute('aria-label')!)
    expect(chosen).not.toBe(hexOf('Navy'))
    expect(contrastRatio(chosen, hexOf('Black'))).toBeGreaterThanOrEqual(3)
    expect(preview()).toContain(chosen)
  })

  it('does not offer a colour that a touching part of the flag already uses', async () => {
    const user = userEvent.setup()
    render(<CountryCreator />)
    await user.click(swatches('Top').getByRole('button', { name: 'Red' }))
    const middle = swatches('Middle')
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'))
    expect(middle).not.toContain('Red')
  })

  it('repairs a clash the shape change created, rather than showing a broken flag', async () => {
    const user = userEvent.setup()
    render(<CountryCreator />)
    // Navy/gold/navy is a good tricolour, but as quarters the third colour is a
    // disc landing on a navy quarter.
    await user.click(screen.getByRole('button', { name: 'Quarters' }))
    const chosen = ['Corners', 'Other corners', 'Circle'].map(
      (group) =>
        swatches(group)
          .getAllByRole('button')
          .find((b) => b.getAttribute('aria-pressed') === 'true')!
          .getAttribute('aria-label')!,
    )
    expect(new Set(chosen).size).toBe(3)
  })

  it('persists the country he built', async () => {
    const user = userEvent.setup()
    render(<CountryCreator />)
    await named(user, 'Riondia')
    await user.click(screen.getByRole('button', { name: 'Bars' }))
    await user.click(swatches('Left').getByRole('button', { name: 'Red' }))
    await user.click(screen.getByRole('button', { name: 'Bear' }))
    await user.click(screen.getByRole('button', { name: 'Take the field' }))

    const saved = getStore().getState().country
    expect(saved).not.toBeNull()
    expect(saved!.name).toBe('Riondia')
    expect(saved!.flag.layout).toBe('bands-v')
    expect(saved!.flag.colors[0]).toBe(hexOf('Red'))
    expect(saved!.flag.charge).toBe('bear')
    expect(saved!.stars).toBe(0)
    expect(saved!.kit).toHaveLength(2)
    expect(saved!.kit[0]).not.toBe(saved!.kit[1])
  })

  it('hands the finished country on, so the app can move to the try-out', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<CountryCreator onComplete={onComplete} />)
    await named(user)
    await user.click(screen.getByRole('button', { name: 'Take the field' }))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete.mock.calls[0][0].name).toBe('Riondia')
  })

  it('saves a decent flag for a child who taps straight past every choice', async () => {
    const user = userEvent.setup()
    render(<CountryCreator />)
    await named(user, 'Zed')
    await user.click(screen.getByRole('button', { name: 'Take the field' }))
    const saved = getStore().getState().country!
    expect(saved.flag.charge).not.toBe('none')
    expect(
      contrastRatio(saved.flag.chargeColor, saved.flag.colors[1]),
      'the default badge must be legible',
    ).toBeGreaterThanOrEqual(3)
  })

  it('blocks an empty name and says why', async () => {
    const user = userEvent.setup()
    render(<CountryCreator />)
    await user.click(screen.getByRole('button', { name: 'Take the field' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/name/i)
    expect(getStore().getState().country).toBeNull()
  })

  it('treats a name of only spaces as empty', async () => {
    const user = userEvent.setup()
    render(<CountryCreator />)
    await named(user, '    ')
    await user.click(screen.getByRole('button', { name: 'Take the field' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(getStore().getState().country).toBeNull()
  })

  it('clears the complaint as soon as he starts typing', async () => {
    const user = userEvent.setup()
    render(<CountryCreator />)
    await user.click(screen.getByRole('button', { name: 'Take the field' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await named(user, 'R')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('trims the name it saves', async () => {
    const user = userEvent.setup()
    render(<CountryCreator />)
    await named(user, '  Riondia  ')
    await user.click(screen.getByRole('button', { name: 'Take the field' }))
    expect(getStore().getState().country!.name).toBe('Riondia')
  })

  it('caps a very long name rather than letting it break the layout', async () => {
    const user = userEvent.setup()
    render(<CountryCreator />)
    const field = screen.getByLabelText('Country name')
    await user.type(field, 'Riondia the Extremely Magnificent Republic of Everything')
    expect((field as HTMLInputElement).value.length).toBeLessThanOrEqual(20)

    // A paste does not go through keystrokes, so the cap cannot live only on
    // the input's own maxlength.
    fireEvent.change(field, { target: { value: 'x'.repeat(200) } })
    expect((field as HTMLInputElement).value.length).toBe(20)

    await user.click(screen.getByRole('button', { name: 'Take the field' }))
    expect(getStore().getState().country!.name.length).toBe(20)
  })

  it('accepts a name a child would actually invent', async () => {
    const user = userEvent.setup()
    render(<CountryCreator />)
    await named(user, "Rion's Zorbia 3")
    await user.click(screen.getByRole('button', { name: 'Take the field' }))
    expect(getStore().getState().country!.name).toBe("Rion's Zorbia 3")
  })

  it('lets him pick a kit and saves it', async () => {
    const user = userEvent.setup()
    render(<CountryCreator />)
    await named(user)
    const kits = within(screen.getByRole('group', { name: 'Kit' })).getAllByRole('button')
    expect(kits.length).toBeGreaterThanOrEqual(3)
    await user.click(kits[kits.length - 1])
    expect(kits[kits.length - 1]).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Take the field' }))
    expect(getStore().getState().country!.kit[0]).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('keeps the kit in step with a recoloured flag', async () => {
    const user = userEvent.setup()
    render(<CountryCreator />)
    await named(user)
    await user.click(swatches('Top').getByRole('button', { name: 'Pink' }))
    await user.click(screen.getByRole('button', { name: 'Take the field' }))
    const kit = getStore().getState().country!.kit
    expect(kit[0]).not.toBe(kit[1])
  })
})

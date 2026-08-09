import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createAvaSession } from '../lib/avaConversation'
import { createNutritionState } from '../lib/nutrition'
import { AvaProvider } from './AvaContext'
import AvaSheet from './AvaSheet'
import {
  isNearTranscriptBottom,
  scrollTranscriptToBottom,
} from './avaSheetScroll'

const renderAvaSheet = (props = {}) =>
  render(
    <AvaProvider>
      <AvaSheet
        open
        onClose={() => {}}
        nutrition={createNutritionState()}
        session={createAvaSession()}
        packet={null}
        role="athlete"
        {...props}
      />
    </AvaProvider>,
  )

describe('avaSheetScroll', () => {
  it('detects when the transcript is near the bottom', () => {
    const element = {
      scrollHeight: 500,
      clientHeight: 200,
      scrollTop: 280,
      scrollTo: vi.fn(),
    }

    expect(isNearTranscriptBottom(element, 80)).toBe(true)
    expect(isNearTranscriptBottom({ ...element, scrollTop: 100 }, 80)).toBe(false)
  })

  it('scrolls only the transcript container', () => {
    const element = {
      scrollHeight: 900,
      scrollTo: vi.fn(),
    }

    scrollTranscriptToBottom(element, 'auto')
    expect(element.scrollTo).toHaveBeenCalledWith({
      top: 900,
      behavior: 'auto',
    })
  })
})

describe('AVA mobile layout structure', () => {
  it('keeps transcript and composer as separate scroll regions', () => {
    renderAvaSheet()

    const dialog = screen.getByRole('dialog', { name: 'Ask AVA' })
    const transcript = dialog.querySelector('.ava-chat-transcript')
    const composer = dialog.querySelector('.ava-sheet-composer')
    const textarea = dialog.querySelector('.ava-sheet-input')

    expect(transcript).toBeTruthy()
    expect(composer).toBeTruthy()
    expect(transcript?.contains(composer)).toBe(false)
    expect(composer?.contains(textarea)).toBe(true)
  })

  it('uses a dedicated composer textarea class', () => {
    renderAvaSheet()

    const textarea = screen.getByLabelText('Your message')
    expect(textarea.classList.contains('ava-sheet-input')).toBe(true)
    expect(textarea).toHaveAttribute('rows', '2')
  })

  it('uses flex column conversation layout classes', () => {
    renderAvaSheet()

    const dialog = screen.getByRole('dialog', { name: 'Ask AVA' })
    expect(dialog.classList.contains('ava-sheet--conversation')).toBe(true)
    expect(dialog.querySelector('.ava-sheet-body')).toBeTruthy()
    expect(dialog.querySelector('.ava-sheet-aux')).toBeTruthy()
  })
})

describe('viewport meta', () => {
  it('documents the expected mobile viewport tag', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
    expect(html).toContain(
      'width=device-width, initial-scale=1, viewport-fit=cover',
    )
    expect(html).not.toContain('user-scalable=no')
    expect(html).not.toContain('maximum-scale=1')
  })

  it('declares a 16px AVA composer font size in stylesheet', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
    expect(css).toMatch(/\.ava-sheet-input[\s\S]{0,220}font-size:\s*16px/)
  })
})

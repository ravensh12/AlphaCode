import { describe, expect, it } from 'vitest'
import appSource from '../App.tsx?raw'
import contextSource from '../context/DemoGuaranteeContext.tsx?raw'
import logicSource from '../lib/demoGuarantee.ts?raw'
import typeSource from '../types/demoGuarantee.ts?raw'
import courseSource from './CourseHomePage.tsx?raw'
import pageSource from './DemoGuaranteePage.tsx?raw'
import profileSource from './ProfilePage.tsx?raw'
import profileStyles from './ProfilePage.css?raw'

describe('demo guarantee route and copy', () => {
  it('protects the route while allowing the existing guest identity path', () => {
    expect(appSource).toContain('path="/demo/guarantee"')
    expect(appSource).toMatch(
      /path="\/demo\/guarantee"[\s\S]*?<ProtectedRoute>[\s\S]*?<DemoGuaranteePage/u,
    )
    expect(contextSource).toContain("status === 'authenticated'")
    expect(contextSource).toContain("? 'guest-local'")
    expect(contextSource).not.toContain("localStore.load('guest')")
  })

  it('shows persistent and near-action warnings plus safe success copy', () => {
    expect(pageSource).toContain(
      'DEMO ONLY — fictional guarantee workflow. No payment provider is connected and no money can move.',
    )
    expect(pageSource).toContain('demo-guarantee-warning-top')
    expect(pageSource).toContain('demo-guarantee-warning-near')
    expect(pageSource).toContain(
      'Simulation saved. No refund was sent.',
    )
    expect(pageSource.toLowerCase()).not.toContain('refund issued')
    expect(pageSource.toLowerCase()).not.toContain('receipt')
  })

  it('confirms fictional approval or denial and exposes reset/export', () => {
    expect(pageSource).toContain('window.confirm(')
    expect(pageSource).toContain('Simulate approved outcome')
    expect(pageSource).toContain('Simulate denied outcome')
    expect(pageSource).toContain('Reset with a new run')
    expect(pageSource).toContain('Download JSON evidence')
    expect(pageSource).toContain('JSON.stringify(simulation, null, 2)')
  })

  it('links the clearly labeled demo from course only', () => {
    expect(courseSource).toContain('to="/demo/guarantee"')
    expect(courseSource).toContain('DEMO ONLY')
    expect(courseSource).toContain('No payment provider is connected')
  })

  it('keeps the removed campaign and guarantee sections off the profile', () => {
    expect(profileSource).not.toContain('Academy campaign')
    expect(profileSource).not.toContain('/demo/guarantee')
    expect(profileSource).not.toContain('guarantee')
    expect(profileStyles).not.toContain('guarantee')
  })

  it('does not declare forbidden evidence fields in the type schema', () => {
    expect(typeSource).not.toMatch(
      /^\s*(money|currency|order|charge|cards?|bank|paymentProvider|customerEmail|financialNotes)\??\s*:/gimu,
    )
    expect(logicSource).not.toContain('Date.now(')
  })
})

import { describe, expect, it } from 'vitest'
import { isShowcaseAccountEmail } from './showcaseAccess'

describe('showcase account access', () => {
  it('matches the exact showcase email after normalization', () => {
    expect(isShowcaseAccountEmail('reachshravanv@gmail.com')).toBe(true)
    expect(isShowcaseAccountEmail('ReachShravanV@GMAIL.COM')).toBe(true)
    expect(isShowcaseAccountEmail('  REACHSHRAVANV@GMAIL.COM  ')).toBe(true)
  })

  it('rejects similarly named and extended addresses', () => {
    expect(isShowcaseAccountEmail('reachshravanv+demo@gmail.com')).toBe(false)
    expect(isShowcaseAccountEmail('reachshravanv@gmail.co')).toBe(false)
    expect(isShowcaseAccountEmail('notreachshravanv@gmail.com')).toBe(false)
    expect(isShowcaseAccountEmail('reachshravanv@gmail.com.example')).toBe(false)
  })

  it('rejects missing email values', () => {
    expect(isShowcaseAccountEmail(null)).toBe(false)
    expect(isShowcaseAccountEmail(undefined)).toBe(false)
    expect(isShowcaseAccountEmail('')).toBe(false)
  })
})

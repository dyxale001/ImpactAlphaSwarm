import { describe, it, expect } from 'vitest'
import { validateEmail, validatePassword, validateGoals } from './validation'

describe('validateGoals', () => {
  const complete = {
    goal_horizon: '2_to_5',
    goal_purpose: 'growth',
    goal_account_type: 'tfsa',
    goal_contribution: 'monthly',
  }

  it('accepts all four answered', () => {
    expect(validateGoals(complete)).toEqual({ isValid: true, message: '' })
  })

  it.each([
    ['goal_horizon', 'when you expect to need this money'],
    ['goal_purpose', 'what this money is for'],
    ['goal_account_type', 'which kind of account you are investing through'],
    ['goal_contribution', 'how you plan to put money in'],
  ])('names the missing answer when %s is blank', (missing, phrase) => {
    // "Please answer all of them" is useless on a page of four cards; the
    // question a reader has is which one they missed.
    const answers = { ...complete, [missing]: '' }
    const result = validateGoals(answers)
    expect(result.isValid).toBe(false)
    expect(result.message).toContain(phrase)
  })

  it('reports the first gap in the order the questions are asked', () => {
    // So following the message walks down the page rather than back up it.
    const result = validateGoals({})
    expect(result.message).toContain('when you expect to need this money')
  })

  it('treats a missing key and an empty string the same way', () => {
    const { goal_purpose: _omitted, ...withoutPurpose } = complete
    expect(validateGoals(withoutPurpose).isValid).toBe(false)
    expect(validateGoals({ ...complete, goal_purpose: '' }).isValid).toBe(false)
  })

  it('has an empty message only when valid', () => {
    expect(validateGoals(complete).message).toBe('')
    expect(validateGoals({}).message).not.toBe('')
  })
})

describe('validateEmail', () => {
  it.each([
    'a@b.co',
    'user@example.com',
    'user.name+tag@example.co.uk',
    'UPPER@EXAMPLE.COM',
    "o'brien@example.com",
  ])('accepts %s', (email) => {
    expect(validateEmail(email)).toBe(true)
  })

  it.each([
    ['', 'empty'],
    ['plainaddress', 'no @'],
    ['a@b', 'no dot in the domain'],
    ['@example.com', 'no local part'],
    ['a@.com', 'no domain name before the dot'],
    ['a b@example.com', 'space in the local part'],
    ['a@exam ple.com', 'space in the domain'],
    ['a@@example.com', 'double @'],
  ])('rejects %s (%s)', (email) => {
    expect(validateEmail(email)).toBe(false)
  })

  it('is a shape check, not a deliverability check', () => {
    // PINNED: the regex is deliberately permissive and will pass addresses that
    // no mail server would accept. Because the dot separator is matched by a
    // character class that itself allows dots, consecutive and trailing dots
    // both slip through. Real verification is the signup email round trip; this
    // only catches typos before a pointless request is made.
    expect(validateEmail('a@b..com')).toBe(true)
    expect(validateEmail('a@example.com.')).toBe(true)
    expect(validateEmail('a@-.-')).toBe(true)
  })
})

describe('validatePassword', () => {
  it('accepts a password meeting every rule', () => {
    expect(validatePassword('Passw0rd!')).toEqual({ isValid: true, message: '' })
  })

  it('rejects a password under 8 characters', () => {
    const result = validatePassword('Pw0!aaa')
    expect(result.isValid).toBe(false)
    expect(result.message).toBe('Password must be at least 8 characters long.')
  })

  it('accepts exactly 8 characters', () => {
    expect(validatePassword('Passw0r!').isValid).toBe(true)
  })

  it.each([
    ['passw0rd!', 'Password must contain at least one uppercase letter.'],
    ['PASSW0RD!', 'Password must contain at least one lowercase letter.'],
    ['Password!', 'Password must contain at least one number.'],
    ['Passw0rdd', 'Password must contain at least one special character.'],
  ])('rejects %s with a message naming the missing rule', (password, message) => {
    expect(validatePassword(password)).toEqual({ isValid: false, message })
  })

  it('reports the length problem first when several rules fail', () => {
    // The user should be told one actionable thing at a time, starting with the
    // one they will hit first.
    expect(validatePassword('ab').message).toBe('Password must be at least 8 characters long.')
  })

  it('always returns a message when invalid and never when valid', () => {
    for (const password of ['', 'short', 'alllowercase1!', 'Passw0rd!', 'NoSpecial1']) {
      const { isValid, message } = validatePassword(password)
      expect(message.length > 0).toBe(!isValid)
    }
  })

  it('only accepts special characters from the declared set', () => {
    // PINNED, and worth knowing: hyphen, underscore, plus, equals and the
    // bracket family are NOT in the accepted set, so a password that looks
    // perfectly strong is rejected with "must contain at least one special
    // character". This is a real source of signup friction, not a bug in the
    // test.
    expect(validatePassword('Password1-').isValid).toBe(false)
    expect(validatePassword('Password1_').isValid).toBe(false)
    expect(validatePassword('Password1+').isValid).toBe(false)
    expect(validatePassword('Password1[').isValid).toBe(false)

    for (const special of ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', ',', '.', '?', '"', ':', '{', '}', '|', '<', '>']) {
      expect(validatePassword(`Password1${special}`).isValid).toBe(true)
    }
  })
})

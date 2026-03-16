/**
 * SET 11: Интеграция с Mandrill (email-провайдер)
 *
 * Отправка транзакционных email через Mandrill API.
 * Трекинг открытий и кликов. Верификация webhook-подписей.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendViaMandrill, isMandrillConfigured, verifyMandrillWebhook } from '@/lib/mailchimp'

// ── Environment Setup ──

const originalEnv = { ...process.env }

beforeEach(() => {
  process.env.MAILCHIMP_TRANSACTIONAL_API_KEY = 'test-mandrill-key'
  process.env.SMTP_FROM = 'test@piqle.io'
  process.env.SMTP_FROM_NAME = 'Test Piqle'
})

afterEach(() => {
  process.env = { ...originalEnv }
  vi.restoreAllMocks()
})

// ── isMandrillConfigured ──

describe('Mandrill > Конфигурация', () => {
  it('API ключ установлен → true', () => {
    process.env.MAILCHIMP_TRANSACTIONAL_API_KEY = 'test-key'
    expect(isMandrillConfigured()).toBe(true)
  })

  it('API ключа нет → false', () => {
    delete process.env.MAILCHIMP_TRANSACTIONAL_API_KEY
    expect(isMandrillConfigured()).toBe(false)
  })
})

// ── sendViaMandrill ──

describe('Mandrill > Отправка email', () => {
  it('нет API ключа → ошибка "not set"', async () => {
    delete process.env.MAILCHIMP_TRANSACTIONAL_API_KEY
    await expect(sendViaMandrill({
      to: 'user@test.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    })).rejects.toThrow('MAILCHIMP_TRANSACTIONAL_API_KEY is not set')
  })

  it('успешная отправка: messageId, status, корректный API вызов', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ _id: 'mandrill-msg-123', status: 'sent', email: 'user@test.com' }],
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await sendViaMandrill({
      to: 'user@test.com',
      subject: 'Test Subject',
      html: '<p>Hello World</p>',
      metadata: {
        logId: 'log-1',
        clubId: 'club-1',
        userId: 'user-1',
        variantId: 'checkin_pattern',
      },
      tags: ['campaign', 'check_in'],
    })

    expect(result.messageId).toBe('mandrill-msg-123')
    expect(result.status).toBe('sent')

    // Verify API call
    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toContain('mandrillapp.com/api/1.0/messages/send.json')

    const body = JSON.parse(options.body)
    expect(body.key).toBe('test-mandrill-key')
    expect(body.message.to[0].email).toBe('user@test.com')
    expect(body.message.subject).toBe('Test Subject')
    expect(body.message.track_opens).toBe(true)
    expect(body.message.track_clicks).toBe(true)
    expect(body.message.metadata.log_id).toBe('log-1')
    expect(body.message.metadata.variant_id).toBe('checkin_pattern')
    expect(body.message.tags).toContain('campaign')
  })

  it('Mandrill отклонил email → ошибка "rejected"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ _id: 'msg-1', status: 'rejected', reject_reason: 'invalid-sender' }],
    }))

    await expect(sendViaMandrill({
      to: 'user@test.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    })).rejects.toThrow('rejected')
  })

  it('API error 500 → ошибка', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ status: 'error', message: 'Internal error' }),
    }))

    await expect(sendViaMandrill({
      to: 'user@test.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    })).rejects.toThrow('API error 500')
  })

  it('HTML → автоматический plain text fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ _id: 'msg-1', status: 'sent' }],
    }))

    await sendViaMandrill({
      to: 'user@test.com',
      subject: 'Test',
      html: '<p>Hello <strong>World</strong></p>',
    })

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as any).body)
    expect(body.message.text).toContain('Hello World')
    expect(body.message.text).not.toContain('<p>')
  })
})

// ── verifyMandrillWebhook ──

describe('Mandrill > Верификация webhook', () => {
  it('нет webhook key (development) → пропуск проверки', async () => {
    delete process.env.MAILCHIMP_WEBHOOK_KEY

    const result = await verifyMandrillWebhook(
      'any-signature',
      'https://example.com/api/webhooks/mailchimp',
      { mandrill_events: '[]' },
    )

    expect(result).toBe(true)
  })

  it('правильная HMAC-SHA1 подпись → true', async () => {
    process.env.MAILCHIMP_WEBHOOK_KEY = 'test-webhook-key'

    // Generate expected signature
    const url = 'https://example.com/api/webhooks/mailchimp'
    const params = { mandrill_events: '[{"event":"open"}]' }

    // Build signed data
    const sortedKeys = Object.keys(params).sort()
    let signedData = url
    for (const key of sortedKeys) {
      signedData += key + params[key as keyof typeof params]
    }

    // Calculate HMAC-SHA1
    const encoder = new TextEncoder()
    const keyData = encoder.encode('test-webhook-key')
    const msgData = encoder.encode(signedData)
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData)
    const correctSignature = Buffer.from(sig).toString('base64')

    const result = await verifyMandrillWebhook(correctSignature, url, params)
    expect(result).toBe(true)
  })

  it('неправильная подпись → false (защита от подделки)', async () => {
    process.env.MAILCHIMP_WEBHOOK_KEY = 'test-webhook-key'

    const result = await verifyMandrillWebhook(
      'wrong-signature',
      'https://example.com/api/webhooks/mailchimp',
      { mandrill_events: '[]' },
    )

    expect(result).toBe(false)
  })
})

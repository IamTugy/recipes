import { Test } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { FeatureRequestsService } from './feature-requests.service'

describe('FeatureRequestsService', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  async function makeService() {
    const config = {
      get: jest.fn((key: string) => ({
        GITHUB_TOKEN: 'gh-token',
        GITHUB_REPO: 'IamTugy/recipes',
      })[key]),
    }
    const moduleRef = await Test.createTestingModule({
      providers: [FeatureRequestsService, { provide: ConfigService, useValue: config }],
    }).compile()
    return moduleRef.get(FeatureRequestsService)
  }

  it('create posts a new GitHub issue labeled feature-request', async () => {
    const mockIssue = {
      number: 42,
      title: 'Add dark mode',
      body: 'Please add dark mode.\n\n---\nSubmitted via the app by user `user_1`.',
      html_url: 'https://github.com/IamTugy/recipes/issues/42',
      state: 'open',
      labels: [{ name: 'feature-request' }],
      created_at: '2026-08-01T00:00:00Z',
    }
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => mockIssue })
    global.fetch = fetchMock as unknown as typeof fetch

    const service = await makeService()
    const result = await service.create('user_1', 'Add dark mode', 'Please add dark mode.')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/IamTugy/recipes/issues',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer gh-token' }),
      }),
    )
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body).toEqual({
      title: 'Add dark mode',
      body: 'Please add dark mode.\n\n---\nSubmitted via the app by user `user_1`.',
      labels: ['feature-request'],
    })
    expect(result).toEqual({
      number: 42,
      title: 'Add dark mode',
      body: mockIssue.body,
      htmlUrl: mockIssue.html_url,
      state: 'open',
      labels: ['feature-request'],
      createdAt: mockIssue.created_at,
      submittedBy: 'user_1',
    })
  })

  it('list fetches issues labeled feature-request', async () => {
    const mockIssues = [
      {
        number: 1,
        title: 'A',
        body: 'body a',
        html_url: 'https://github.com/x/1',
        state: 'open',
        labels: ['feature-request'],
        created_at: '2026-08-01T00:00:00Z',
      },
    ]
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => mockIssues })
    global.fetch = fetchMock as unknown as typeof fetch

    const service = await makeService()
    const result = await service.list()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/IamTugy/recipes/issues?labels=feature-request&state=all&per_page=50',
      expect.anything(),
    )
    expect(result).toEqual([{
      number: 1,
      title: 'A',
      body: 'body a',
      htmlUrl: 'https://github.com/x/1',
      state: 'open',
      labels: ['feature-request'],
      createdAt: '2026-08-01T00:00:00Z',
      submittedBy: null,
    }])
  })

  it('list extracts the submitter user ID embedded in the issue body', async () => {
    const mockIssues = [
      {
        number: 1,
        title: 'A',
        body: 'Do the thing.\n\n---\nSubmitted via the app by user `user_42`.',
        html_url: 'https://github.com/x/1',
        state: 'open',
        labels: ['feature-request'],
        created_at: '2026-08-01T00:00:00Z',
      },
    ]
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => mockIssues })
    global.fetch = fetchMock as unknown as typeof fetch

    const service = await makeService()
    const result = await service.list()

    expect(result[0].submittedBy).toBe('user_42')
  })

  it('approve adds the approved-for-claude label to the issue', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    global.fetch = fetchMock as unknown as typeof fetch

    const service = await makeService()
    await service.approve(42)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/IamTugy/recipes/issues/42/labels',
      expect.objectContaining({ method: 'POST' }),
    )
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ labels: ['approved-for-claude'] })
  })

  it('throws when the GitHub API responds with a non-OK status', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 403 })
    global.fetch = fetchMock as unknown as typeof fetch

    const service = await makeService()
    await expect(service.list()).rejects.toThrow('GitHub API request failed: 403')
  })
})

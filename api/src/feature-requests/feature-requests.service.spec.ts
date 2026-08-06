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

  function mockIssueFetch(issue: Record<string, unknown>) {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => issue })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...issue, title: 'Updated', body: 'Updated body' }) })
    global.fetch = fetchMock as unknown as typeof fetch
    return fetchMock
  }

  const openIssue = {
    number: 42,
    title: 'Add dark mode',
    body: 'Please add dark mode.\n\n---\nSubmitted via the app by user `user_1`.',
    html_url: 'https://github.com/IamTugy/recipes/issues/42',
    state: 'open',
    labels: [{ name: 'feature-request' }],
    created_at: '2026-08-01T00:00:00Z',
  }

  it('update edits the issue title and body when the requester owns it', async () => {
    const fetchMock = mockIssueFetch(openIssue)

    const service = await makeService()
    const result = await service.update('user_1', 42, 'Updated', 'Updated body')

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.github.com/repos/IamTugy/recipes/issues/42',
      expect.objectContaining({ method: 'PATCH' }),
    )
    const [, init] = fetchMock.mock.calls[1]
    expect(JSON.parse(init.body)).toEqual({
      title: 'Updated',
      body: 'Updated body\n\n---\nSubmitted via the app by user `user_1`.',
    })
    expect(result.title).toBe('Updated')
  })

  it('update rejects editing a request submitted by another user', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({ ok: true, json: async () => openIssue })
    global.fetch = fetchMock as unknown as typeof fetch

    const service = await makeService()
    await expect(service.update('someone_else', 42, 'Updated', 'Updated body')).rejects.toThrow(
      'You can only edit or withdraw your own feature requests',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('update rejects editing a request that already has work started', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...openIssue, labels: [{ name: 'approved-for-claude' }] }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const service = await makeService()
    await expect(service.update('user_1', 42, 'Updated', 'Updated body')).rejects.toThrow(
      'can no longer be edited or withdrawn',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('update rejects editing an already-closed request', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...openIssue, state: 'closed' }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const service = await makeService()
    await expect(service.update('user_1', 42, 'Updated', 'Updated body')).rejects.toThrow(
      'already closed',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('withdraw closes the issue when the requester owns it', async () => {
    const fetchMock = mockIssueFetch(openIssue)

    const service = await makeService()
    await service.withdraw('user_1', 42)

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.github.com/repos/IamTugy/recipes/issues/42',
      expect.objectContaining({ method: 'PATCH' }),
    )
    const [, init] = fetchMock.mock.calls[1]
    expect(JSON.parse(init.body)).toEqual({ state: 'closed' })
  })

  it('withdraw rejects withdrawing a request submitted by another user', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({ ok: true, json: async () => openIssue })
    global.fetch = fetchMock as unknown as typeof fetch

    const service = await makeService()
    await expect(service.withdraw('someone_else', 42)).rejects.toThrow(
      'You can only edit or withdraw your own feature requests',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

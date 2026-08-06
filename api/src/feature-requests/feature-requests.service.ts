import { ForbiddenException, Injectable, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

export interface FeatureRequest {
  number: number
  title: string
  body: string
  htmlUrl: string
  state: string
  labels: string[]
  createdAt: string
  submittedBy: string | null
}

const FEATURE_REQUEST_LABEL = 'feature-request'
const APPROVED_LABEL = 'approved-for-claude'
const SUBMITTER_PATTERN = /Submitted via the app by user `([^`]+)`\./
const LOCKED_LABELS = ['approved-for-claude', 'claude-in-progress', 'claude-pr-open', 'claude-needs-input']

interface GitHubIssue {
  number: number
  title: string
  body: string | null
  html_url: string
  state: string
  labels: (string | { name: string })[]
  created_at: string
}

@Injectable()
export class FeatureRequestsService {
  private readonly token: string
  private readonly repo: string

  constructor(private readonly config: ConfigService) {
    this.token = this.config.get<string>('GITHUB_TOKEN')!
    this.repo = this.config.get<string>('GITHUB_REPO')!
  }

  private async githubFetch(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`https://api.github.com/repos/${this.repo}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'recipes-app',
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })
    if (!res.ok) {
      throw new InternalServerErrorException(`GitHub API request failed: ${res.status}`)
    }
    return res
  }

  private toFeatureRequest(issue: GitHubIssue): FeatureRequest {
    const body = issue.body ?? ''
    return {
      number: issue.number,
      title: issue.title,
      body,
      htmlUrl: issue.html_url,
      state: issue.state,
      labels: issue.labels.map(l => (typeof l === 'string' ? l : l.name)),
      createdAt: issue.created_at,
      submittedBy: body.match(SUBMITTER_PATTERN)?.[1] ?? null,
    }
  }

  async create(userId: string, title: string, description: string): Promise<FeatureRequest> {
    const res = await this.githubFetch('/issues', {
      method: 'POST',
      body: JSON.stringify({
        title,
        body: `${description}\n\n---\nSubmitted via the app by user \`${userId}\`.`,
        labels: [FEATURE_REQUEST_LABEL],
      }),
    })
    const issue = (await res.json()) as GitHubIssue
    return this.toFeatureRequest(issue)
  }

  async list(): Promise<FeatureRequest[]> {
    const res = await this.githubFetch(`/issues?labels=${FEATURE_REQUEST_LABEL}&state=all&per_page=50`)
    const issues = (await res.json()) as GitHubIssue[]
    return issues.map(issue => this.toFeatureRequest(issue))
  }

  async approve(issueNumber: number): Promise<void> {
    await this.githubFetch(`/issues/${issueNumber}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels: [APPROVED_LABEL] }),
    })
  }

  async getById(issueNumber: number): Promise<FeatureRequest> {
    const res = await this.githubFetch(`/issues/${issueNumber}`)
    const issue = (await res.json()) as GitHubIssue
    return this.toFeatureRequest(issue)
  }

  private assertEditableBy(userId: string, request: FeatureRequest): void {
    if (request.submittedBy !== userId) {
      throw new ForbiddenException('You can only edit or withdraw your own feature requests')
    }
    if (request.state === 'closed') {
      throw new ForbiddenException('This feature request is already closed')
    }
    if (request.labels.some(label => LOCKED_LABELS.includes(label))) {
      throw new ForbiddenException('This feature request can no longer be edited or withdrawn because work on it has already started')
    }
  }

  async update(userId: string, issueNumber: number, title: string, description: string): Promise<FeatureRequest> {
    const existing = await this.getById(issueNumber)
    this.assertEditableBy(userId, existing)

    const res = await this.githubFetch(`/issues/${issueNumber}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title,
        body: `${description}\n\n---\nSubmitted via the app by user \`${userId}\`.`,
      }),
    })
    const issue = (await res.json()) as GitHubIssue
    return this.toFeatureRequest(issue)
  }

  async withdraw(userId: string, issueNumber: number): Promise<void> {
    const existing = await this.getById(issueNumber)
    this.assertEditableBy(userId, existing)

    await this.githubFetch(`/issues/${issueNumber}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    })
  }
}

import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { verifyToken, createClerkClient } from '@clerk/backend'
import { jwtVerify } from 'jose'
import { UsersService } from '../users/users.service'
import { IS_PUBLIC_KEY } from './public.decorator'

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name)
  private readonly secretKey: string
  private readonly clerkClient: ReturnType<typeof createClerkClient>

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    this.secretKey = this.config.get<string>('CLERK_SECRET_KEY')!
    this.clerkClient = createClerkClient({ secretKey: this.secretKey })
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest()
    const authHeader: string | undefined = request.headers?.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token')
    }
    const token = authHeader.slice('Bearer '.length)

    // A personal API key (used by the MCP server so external tools like
    // Claude/Gemini/ChatGPT can upload recipes on the owner's behalf)
    // authenticates as the owner directly, bypassing Clerk entirely. Only
    // set in the environment for that single trusted integration.
    const apiKey = this.config.get<string>('RECIPES_API_KEY')
    if (apiKey && token === apiKey) {
      request.userId = this.config.get<string>('OWNER_USER_ID')
      return true
    }

    // The MCP server's OAuth proxy signs its own short-lived JWT (carrying
    // just a verified Clerk userId claim) for write-tool calls made on
    // behalf of a signed-in third-party user, since Clerk's own OAuth
    // access tokens use a token format verifyToken() below doesn't accept.
    const mcpJwtSecret = this.config.get<string>('MCP_JWT_SECRET')
    if (mcpJwtSecret) {
      try {
        const { payload } = await jwtVerify(token, new TextEncoder().encode(mcpJwtSecret))
        if (typeof payload.userId === 'string') {
          request.userId = payload.userId
          return true
        }
      } catch {
        // Not one of our MCP-issued JWTs - fall through to normal Clerk verification below.
      }
    }

    let userId: string
    try {
      const payload = await verifyToken(token, { secretKey: this.secretKey })
      userId = payload.sub
    } catch {
      throw new UnauthorizedException('Invalid or expired token')
    }

    request.userId = userId

    // Profile sync is best-effort: the token is already cryptographically
    // verified above, so a Clerk outage or a Mongo write failure here is not a
    // security reason to reject an otherwise valid request.
    try {
      const clerkUser = await this.clerkClient.users.getUser(userId)
      const email = clerkUser.emailAddresses[0]?.emailAddress ?? ''
      const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || undefined
      await this.usersService.upsertFromClerk(userId, email, name, clerkUser.imageUrl)
    } catch (err) {
      this.logger.error(`Failed to sync Clerk profile for user ${userId}`, err instanceof Error ? err.stack : err)
    }

    return true
  }
}

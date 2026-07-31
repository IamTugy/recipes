import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { verifyToken, createClerkClient } from '@clerk/backend'
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
      const name = clerkUser.firstName ?? undefined
      await this.usersService.upsertFromClerk(userId, email, name)
    } catch (err) {
      this.logger.error(`Failed to sync Clerk profile for user ${userId}`, err instanceof Error ? err.stack : err)
    }

    return true
  }
}

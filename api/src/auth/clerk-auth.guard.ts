import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { verifyToken, createClerkClient } from '@clerk/backend'
import { UsersService } from '../users/users.service'
import { IS_PUBLIC_KEY } from './public.decorator'

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {}

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
    const secretKey = this.config.get<string>('CLERK_SECRET_KEY')!

    let userId: string
    try {
      const payload = await verifyToken(token, { secretKey })
      userId = payload.sub
    } catch {
      throw new UnauthorizedException('Invalid or expired token')
    }

    request.userId = userId

    const clerkClient = createClerkClient({ secretKey })
    const clerkUser = await clerkClient.users.getUser(userId)
    const email = clerkUser.emailAddresses[0]?.emailAddress ?? ''
    const name = clerkUser.firstName ?? undefined
    await this.usersService.upsertFromClerk(userId, email, name)

    return true
  }
}

import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { UsersModule } from '../users/users.module'
import { ClerkAuthGuard } from './clerk-auth.guard'

@Module({
  imports: [UsersModule],
  providers: [{ provide: APP_GUARD, useClass: ClerkAuthGuard }],
})
export class AuthModule {}

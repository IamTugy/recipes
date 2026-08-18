import { Body, Controller, Get, Patch, Query, Req } from '@nestjs/common'
import { Request } from 'express'
import { UsersService } from './users.service'
import { UpdatePreferencesDto } from './dto/update-preferences.dto'

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('search')
  async search(@Query('q') q: string | undefined, @Req() req: Request & { userId: string }) {
    return this.usersService.search(q ?? '', req.userId)
  }

  @Get('me/preferences')
  async getPreferences(@Req() req: Request & { userId: string }) {
    return this.usersService.getPreferences(req.userId)
  }

  @Patch('me/preferences')
  async updatePreferences(@Body() body: UpdatePreferencesDto, @Req() req: Request & { userId: string }) {
    return this.usersService.setPreferences(req.userId, body)
  }
}

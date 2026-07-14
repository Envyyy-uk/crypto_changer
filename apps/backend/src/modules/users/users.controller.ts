import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@CurrentUser() authUser: AuthenticatedUser) {
    const user = await this.users.findByIdOrThrow(authUser.userId);
    return this.users.toPublic(user);
  }
}

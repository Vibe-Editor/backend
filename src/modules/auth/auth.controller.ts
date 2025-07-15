import {
  Controller,
  Get,
  UseGuards,
  Req,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { Request, Response } from 'express';
import { User } from '../../../generated/prisma';
import { CurrentUser } from '../../common/decorators/user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Req() req: Request) {
    // Initiates Google OAuth flow
    // This endpoint will redirect to Google
  }

  @Get('google-redirect')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    try {
      const user = req.user as User;
      const loginResult = await this.authService.login(user);

      // Redirect to desktop app with token
      const redirectUrl = `myapp://auth-callback?token=${loginResult.access_token}&user=${encodeURIComponent(JSON.stringify(loginResult.user))}`;

      // For testing, also return JSON response
      res.status(HttpStatus.OK).json({
        success: true,
        message: 'Authentication successful',
        redirect_url: redirectUrl,
        ...loginResult,
      });
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Authentication failed',
        error: error.message,
      });
    }
  }

  @Get('status')
  @UseGuards(AuthGuard('jwt'))
  async getStatus(@CurrentUser() user: User) {
    return {
      success: true,
      user,
      message: 'User is authenticated',
    };
  }
}

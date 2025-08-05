import {
  Controller,
  Get,
  UseGuards,
  Req,
  Res,
  Query,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { Request, Response } from 'express';
import { User } from '../../../generated/prisma';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(
    @Req() req: Request,
    @Query('redirect_uri') redirectUri?: string,
  ) {
    // The redirect_uri is handled through state parameter in GoogleStrategy
    // Passport will automatically add the state parameter to the OAuth URL
  }

  @Get('google-redirect')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    try {
      const user = req.user as User;
      const loginResult = await this.authService.login(user);

      // Electron app response - returns JSON with custom protocol redirect
      const redirectUrl = `myapp://auth-callback?token=${loginResult.access_token}&user=${encodeURIComponent(JSON.stringify(loginResult.user))}`;

      res.status(200).json({
        success: true,
        message: 'Authentication successful',
        redirect_url: redirectUrl,
        ...loginResult,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Authentication failed',
        error: error.message,
      });
    }
  }

  @Get('web/google')
  @UseGuards(AuthGuard('google-web'))
  async webGoogleAuth(
    @Req() req: Request,
    @Query('redirect_uri') redirectUri?: string,
  ) {
    // The redirect_uri is handled through state parameter in GoogleWebStrategy
    // Passport will automatically add the state parameter to the OAuth URL
  }

  @Get('web/google-redirect')
  @UseGuards(AuthGuard('google-web'))
  async webGoogleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    try {
      const user = req.user as User;
      const loginResult = await this.authService.login(user);

      // Get frontend URL from environment variables
      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        'http://localhost:5173';

      // Redirect to frontend with token - simple approach
      const redirectUrl = `${frontendUrl}/home?token=${loginResult.access_token}`;
      return res.redirect(redirectUrl);
    } catch (error) {
      // Redirect to frontend with error
      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        'http://localhost:5173';
      const errorUrl = `${frontendUrl}/auth/error?message=${encodeURIComponent('Authentication failed')}`;
      return res.redirect(errorUrl);
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

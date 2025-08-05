import {
  Controller,
  Get,
  UseGuards,
  Req,
  Res,
  HttpStatus,
  Query,
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
  async googleAuth(
    @Req() req: Request,
    @Query('redirect_uri') redirectUri?: string,
  ) {
    // The redirect_uri will be preserved in the state parameter by Passport
    // This is handled automatically by the GoogleStrategy
  }

  @Get('google-redirect')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    try {
      const userWithRedirect = req.user as any;
      const { redirectUri, ...user } = userWithRedirect;
      const loginResult = await this.authService.login(user);

      if (redirectUri) {
        // Frontend provided a redirect_uri, so redirect there with token
        const frontendCallbackUrl = `${redirectUri}?token=${loginResult.access_token}&user=${encodeURIComponent(JSON.stringify(loginResult.user))}`;
        return res.redirect(frontendCallbackUrl);
      } else {
        // No redirect_uri provided, return JSON (for mobile/electron or direct API calls)
        const redirectUrl = `myapp://auth-callback?token=${loginResult.access_token}&user=${encodeURIComponent(JSON.stringify(loginResult.user))}`;

        res.status(HttpStatus.OK).json({
          success: true,
          message: 'Authentication successful',
          redirect_url: redirectUrl,
          ...loginResult,
        });
      }
    } catch (error) {
      const userWithRedirect = req.user as any;
      const redirectUri = userWithRedirect?.redirectUri;

      if (redirectUri) {
        // Redirect to frontend with error
        const errorUrl = `${redirectUri}?error=${encodeURIComponent(error.message)}`;
        return res.redirect(errorUrl);
      } else {
        // Return JSON error
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          success: false,
          message: 'Authentication failed',
          error: error.message,
        });
      }
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

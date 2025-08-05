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
    // The redirect_uri is handled through state parameter in GoogleStrategy
    // Passport will automatically add the state parameter to the OAuth URL
  }

  @Get('google-redirect')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    try {
      const user = req.user as User;
      const loginResult = await this.authService.login(user);

      // For now, always redirect to your Vercel frontend
      const frontendCallbackUrl = `https://testingui-fza5haf8d-naval1525s-projects.vercel.app/auth/google-redirect?token=${loginResult.access_token}&user=${encodeURIComponent(JSON.stringify(loginResult.user))}`;
      return res.redirect(frontendCallbackUrl);
    } catch (error) {
      // Redirect to frontend with error
      const errorUrl = `https://testingui-fza5haf8d-naval1525s-projects.vercel.app/auth/google-redirect?error=${encodeURIComponent(error.message)}`;
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

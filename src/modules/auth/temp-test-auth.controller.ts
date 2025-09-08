import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

@Controller('auth/test')
export class TempTestAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('generate-token')
  async generateTestToken(@Body('email') email: string) {
    if (!email) {
      return { error: 'Email is required' };
    }

    try {
      // Find or create a test user
      let user = await this.usersService.findByEmail(email);
      
      if (!user) {
        // Create a temporary test user
        const userData = {
          email,
          googleId: `test-${Date.now()}`,
          name: email.split('@')[0],
        };
        user = await this.usersService.findOrCreate(userData);
      }

      const token = await this.authService.generateJwtToken(user);

      return {
        success: true,
        access_token: token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        message: 'Test token generated successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

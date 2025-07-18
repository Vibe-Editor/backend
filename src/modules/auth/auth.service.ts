import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { User } from '../../../generated/prisma';

export interface JwtPayload {
  sub: string;
  email: string;
  name?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async validateGoogleUser(profile: any): Promise<User> {
    const { id, emails, displayName, photos } = profile;

    const userData = {
      email: emails[0].value,
      googleId: id,
      name: displayName,
      avatar: photos[0]?.value,
    };

    return this.usersService.findOrCreate(userData);
  }

  async generateJwtToken(user: User): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
    };

    return this.jwtService.sign(payload);
  }

  async validateJwtPayload(payload: JwtPayload): Promise<User | null> {
    return this.usersService.findById(payload.sub);
  }

  async login(user: User): Promise<{ user: User; access_token: string }> {
    const access_token = await this.generateJwtToken(user);

    return {
      user,
      access_token,
    };
  }
}

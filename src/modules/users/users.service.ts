import { Injectable } from '@nestjs/common';
import { PrismaClient, User } from '@prisma/client';

@Injectable()
export class UsersService {
  private prisma = new PrismaClient();

  async findOrCreate(userData: {
    email: string;
    googleId: string;
    name?: string;
    avatar?: string;
  }): Promise<User> {
    try {
      // First try to find user by Google ID
      let user = await this.prisma.user.findFirst({
        where: { googleId: userData.googleId },
      });

      // If not found by Google ID, try by email
      if (!user) {
        user = await this.prisma.user.findUnique({
          where: { email: userData.email },
        });

        // If found by email but no Google ID, update with Google ID
        if (user) {
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: {
              googleId: userData.googleId,
              name: userData.name || user.name,
              avatar: userData.avatar || user.avatar,
            },
          });
        }
      }

      // If still not found, create new user
      if (!user) {
        user = await this.prisma.user.create({
          data: {
            email: userData.email,
            googleId: userData.googleId,
            name: userData.name,
            avatar: userData.avatar,
            credits: 500, // Explicitly set starting credits
          },
        });
      }

      return user;
    } catch (error) {
      throw new Error(`Failed to find or create user: ${error.message}`);
    }
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { googleId },
    });
  }

  async findAll(): Promise<User[]> {
    return this.prisma.user.findMany();
  }

  async updateUser(id: string, updateData: Partial<User>): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteUser(id: string): Promise<User> {
    return this.prisma.user.delete({
      where: { id },
    });
  }
}

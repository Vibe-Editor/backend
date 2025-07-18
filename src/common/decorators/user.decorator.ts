import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../../../generated/prisma';

export { User };

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);

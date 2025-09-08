import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
} from '@nestjs/common';
import { ContextService } from './context.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { UpdateProjectSummaryDto, UpdateUserContextDto } from './dto/context.dto';

@Controller('context')
@UseGuards(JwtAuthGuard)
export class ContextController {
  constructor(
    private readonly userContextService: ContextService,
  ) {}

  // NEW: Get current user's context
  @Get()
  async getMyContext(@CurrentUser() user: any) {
    return this.userContextService.getUserContext(user.id);
  }

  // NEW: Update current user's context  
  @Post()
  async updateMyContext(
    @CurrentUser() user: any,
    @Body() updateUserContextDto:UpdateUserContextDto
  ) {
    return this.userContextService.updateUserContext(updateUserContextDto.projectId);
  }

  // NEW: Update project summary
  @Post(':id')
  async updateProjectSummary(
    @Param('id') id: string,
    @Body() updateSummaryDto: UpdateProjectSummaryDto
  ) {
    return this.userContextService.updateProjectContext(id, updateSummaryDto.newConversations);
  }

  // NEW: Get project summary
  @Get(':id')
  async getProjectSummary(@Param('id') id: string) {
    return this.userContextService.getProjectContext(id);
  }

}

import { Controller, Get, Query, Redirect, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrcidService } from './orcid.service';

@ApiTags('orcid')
@Controller('orcid')
export class OrcidController {
  constructor(private orcidService: OrcidService) {}

  @Get('connect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  connect(@Request() req: any) {
    const url = this.orcidService.getAuthorizationUrl(req.user.sub);
    return { url };
  }

  @Get('callback')
  @Redirect('http://localhost:3000/settings?orcid=connected')
  async callback(@Query('code') code: string, @Query('state') state: string) {
    await this.orcidService.handleCallback(code, state);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getProfile(@Request() req: any) {
    return this.orcidService.getProfile(req.user.sub);
  }
}

import { Controller, Get, Query, UseGuards, Request, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrcidService } from './orcid.service';
import { Response } from 'express';

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
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    await this.orcidService.handleCallback(code, state);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/settings?orcid=connected`);
    await this.orcidService.handleCallback(code, state);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getProfile(@Request() req: any) {
    return this.orcidService.getProfile(req.user.sub);
  }
}

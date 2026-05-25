import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getSettings() {
    let settings = await this.prisma.systemSettings.findFirst();
    if (!settings) {
      settings = await this.prisma.systemSettings.create({
        data: {
          id: 'default',
          institutionName: 'Universidad Nacional de Trujillo',
          maxGrade: 20,
          aiModel: 'gpt-4o',
          aiProvider: 'openai',
          approvalThreshold: 60,
          rigorLevel: 'Alto',
        },
      });
    }
    return settings;
  }

  async updateSettings(data: {
    institutionName?: string;
    maxGrade?: number;
    aiModel?: string;
    aiProvider?: string;
    approvalThreshold?: number;
    rigorLevel?: string;
  }) {
    const settings = await this.getSettings();
    return this.prisma.systemSettings.update({
      where: { id: settings.id },
      data: {
        ...(data.institutionName && { institutionName: data.institutionName }),
        ...(data.maxGrade !== undefined && { maxGrade: data.maxGrade }),
        ...(data.aiModel && { aiModel: data.aiModel }),
        ...(data.aiProvider && { aiProvider: data.aiProvider }),
        ...(data.approvalThreshold !== undefined && { approvalThreshold: data.approvalThreshold }),
        ...(data.rigorLevel && { rigorLevel: data.rigorLevel }),
      },
    });
  }
}

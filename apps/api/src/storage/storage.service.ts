import { Injectable, Logger } from '@nestjs/common';
import * as Minio from 'minio';
import { Readable } from 'stream';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: Minio.Client;
  private bucket: string;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT || process.env.MINIO_ENDPOINT || '';
    if (!endpoint) {
      this.logger.warn('S3 endpoint no configurado — almacenamiento no disponible');
      this.client = null as any;
      this.bucket = '';
      return;
    }

    const portStr = process.env.S3_PORT || process.env.MINIO_PORT || '9000';
    const useSSL = process.env.S3_USE_SSL !== 'false';
    const accessKey = process.env.S3_ACCESS_KEY || process.env.MINIO_ACCESS_KEY || '';
    const secretKey = process.env.S3_SECRET_KEY || process.env.MINIO_SECRET_KEY || '';

    const port = portStr ? parseInt(portStr, 10) : undefined;

    try {
      this.client = new Minio.Client({
        endPoint: endpoint,
        ...(port && !isNaN(port) ? { port } : {}),
        useSSL,
        accessKey,
        secretKey,
        ...(endpoint.includes('supabase.co') || endpoint.includes('r2.cloudflarestorage.com')
          ? { region: process.env.S3_REGION || 'auto' }
          : {}),
      });
      this.bucket = process.env.S3_BUCKET || process.env.MINIO_BUCKET || 'thesis-documents';
      this.ensureBucket();
    } catch (error) {
      this.logger.warn(`Error inicializando MinIO/S3: ${error}`);
      this.client = null as any;
      this.bucket = '';
    }
  }

  private async ensureBucket() {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Bucket '${this.bucket}' created`);
      }
    } catch (error) {
      this.logger.warn(`Could not check/create bucket: ${error}`);
    }
  }

  private ensureReady() {
    if (!this.client) {
      throw new Error('Almacenamiento S3 no disponible — verifique S3_ENDPOINT');
    }
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<string> {
    this.ensureReady();
    await this.client!.putObject(this.bucket, key, buffer, buffer.length, {
      'Content-Type': contentType,
    });
    this.logger.log(`Uploaded: ${key} (${buffer.length} bytes)`);
    return key;
  }

  async download(key: string): Promise<Buffer> {
    this.ensureReady();
    const stream = await this.client!.getObject(this.bucket, key);
    return this.streamToBuffer(stream);
  }

  async getPresignedUrl(key: string, expirySeconds = 3600): Promise<string> {
    this.ensureReady();
    return this.client!.presignedGetObject(this.bucket, key, expirySeconds);
  }

  async delete(key: string): Promise<void> {
    this.ensureReady();
    await this.client!.removeObject(this.bucket, key);
    this.logger.log(`Deleted: ${key}`);
  }

  private streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}

import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import { Resend } from 'resend';
import type { IEmailProvider, SendEmailOptions } from './email-provider.interface';

@Injectable()
export class ResendEmailProvider implements IEmailProvider, OnModuleInit {
  private readonly logger = new Logger(ResendEmailProvider.name);
  private client: Resend;

  onModuleInit() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new InternalServerErrorException('RESEND_API_KEY no configurado');
    }
    this.client = new Resend(apiKey);
  }

  async send(options: SendEmailOptions): Promise<void> {
    const from = process.env.MAILER_FROM ?? 'onboarding@resend.dev';
    const { error } = await this.client.emails.send({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      this.logger.error(`Error enviando email a ${options.to}: ${error.message}`);
      throw new InternalServerErrorException('Error al enviar el correo electrónico');
    }

    this.logger.log(`Email enviado a ${options.to} — "${options.subject}"`);
  }
}

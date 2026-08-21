import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import type { IEmailProvider, SendEmailOptions } from './email-provider.interface';

@Injectable()
export class MsGraphEmailProvider implements IEmailProvider, OnModuleInit {
  private readonly logger = new Logger(MsGraphEmailProvider.name);

  private tenantId: string;
  private clientId: string;
  private clientSecret: string;
  private mailFrom: string;

  onModuleInit() {
    this.tenantId = process.env.TENANT_ID ?? '';
    this.clientId = process.env.CLIENT_ID ?? '';
    this.clientSecret = process.env.CLIENT_SECRET ?? '';
    this.mailFrom = process.env.MAIL_FROM ?? '';

    if (!this.tenantId || !this.clientId || !this.clientSecret || !this.mailFrom) {
      throw new InternalServerErrorException(
        'TENANT_ID, CLIENT_ID, CLIENT_SECRET y MAIL_FROM son requeridos',
      );
    }
  }

  private async getAccessToken(): Promise<string> {
    const url = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Error obteniendo token OAuth2: ${res.status} ${text}`);
    }

    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) {
      throw new Error('Respuesta OAuth2 sin access_token');
    }

    return data.access_token;
  }

  async send(options: SendEmailOptions): Promise<void> {
    try {
      const token = await this.getAccessToken();

      const payload = {
        message: {
          subject: options.subject,
          body: {
            contentType: 'HTML',
            content: options.html,
          },
          toRecipients: [
            { emailAddress: { address: options.to } },
          ],
        },
        saveToSentItems: false,
      };

      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users/${this.mailFrom}/sendMail`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Graph API respondió ${res.status}: ${text}`);
      }

      this.logger.log(`Email enviado a ${options.to} — "${options.subject}"`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const cause = err instanceof Error && (err as any).cause ? String((err as any).cause) : '';
      this.logger.error(`Error enviando email a ${options.to}: ${message}${cause ? ` | cause: ${cause}` : ''}`);
      throw new InternalServerErrorException('Error al enviar el correo electrónico');
    }
  }
}

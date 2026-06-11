import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_PROVIDER } from './providers/email-provider.interface';
import type { IEmailProvider } from './providers/email-provider.interface';

@Injectable()
export class MailerService {
  constructor(
    @Inject(EMAIL_PROVIDER) private readonly provider: IEmailProvider,
  ) {}

  async sendInvitacion(to: string, rawToken: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
    const url = `${frontendUrl}/auth/invitacion?token=${rawToken}`;
    const ttlHoras = process.env.INVITATION_TTL_HOURS ?? '48';

    await this.provider.send({
      to,
      subject: 'Completá tu registro',
      html: buildInvitacionHtml(url, ttlHoras),
    });
  }

  async sendResetPassword(to: string, rawToken: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
    const url = `${frontendUrl}/auth/reset-password?token=${rawToken}`;
    const ttlHoras = process.env.RESET_PASSWORD_TTL_HOURS ?? '1';

    await this.provider.send({
      to,
      subject: 'Restablecer contraseña',
      html: buildResetPasswordHtml(url, ttlHoras),
    });
  }
}

function buildInvitacionHtml(url: string, ttlHoras: string): string {
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #333;">
      <h2 style="color: #1a56db;">Fuiste invitado al sistema</h2>
      <p>Un administrador te ha enviado una invitación para crear tu cuenta.</p>
      <p>Hacé clic en el siguiente botón para completar tu registro eligiendo una contraseña:</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${url}"
           style="background-color: #1a56db; color: #fff; padding: 12px 28px;
                  text-decoration: none; border-radius: 6px; font-size: 16px;">
          Completar registro
        </a>
      </div>
      <p style="font-size: 13px; color: #666;">
        Este enlace expira en <strong>${ttlHoras} horas</strong>.<br>
        Si no esperabas esta invitación, podés ignorar este correo.
      </p>
    </body>
    </html>
  `;
}

function buildResetPasswordHtml(url: string, ttlHoras: string): string {
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #333;">
      <h2 style="color: #1a56db;">Restablecer contraseña</h2>
      <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
      <p>Hacé clic en el siguiente botón para elegir una nueva contraseña:</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${url}"
           style="background-color: #1a56db; color: #fff; padding: 12px 28px;
                  text-decoration: none; border-radius: 6px; font-size: 16px;">
          Restablecer contraseña
        </a>
      </div>
      <p style="font-size: 13px; color: #666;">
        Este enlace expira en <strong>${ttlHoras} hora${ttlHoras === '1' ? '' : 's'}</strong>.<br>
        Si no solicitaste este cambio, podés ignorar este correo.
      </p>
    </body>
    </html>
  `;
}

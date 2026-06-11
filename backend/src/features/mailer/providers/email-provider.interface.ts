export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export interface IEmailProvider {
  send(options: SendEmailOptions): Promise<void>;
}

export const EMAIL_PROVIDER = Symbol('IEmailProvider');

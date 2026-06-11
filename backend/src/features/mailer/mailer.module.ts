import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { ResendEmailProvider } from './providers/resend.provider';
import { EMAIL_PROVIDER } from './providers/email-provider.interface';

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_PROVIDER,
      useClass: ResendEmailProvider,
    },
    MailerService,
  ],
  exports: [MailerService],
})
export class MailerModule {}

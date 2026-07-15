import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { MsGraphEmailProvider } from './providers/ms-graph.provider';
import { EMAIL_PROVIDER } from './providers/email-provider.interface';

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_PROVIDER,
      useClass: MsGraphEmailProvider,
    },
    MailerService,
  ],
  exports: [MailerService],
})
export class MailerModule {}

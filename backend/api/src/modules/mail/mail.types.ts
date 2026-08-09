export type MailProvider = 'resend' | 'smtp' | 'none';

export type SendMailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type PasswordResetCodeMailPayload = {
  to: string;
  recipientName: string;
  code: string;
};

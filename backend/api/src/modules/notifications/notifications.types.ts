import type { NotificationStatus, OrderStatus } from '@prisma/client';

export type SmsNotificationHistoryItem = {
  id: string;
  status: NotificationStatus;
  title: string;
  body: string;
  createdAt: string;
  sentAt: string | null;
  orderId: string | null;
  orderNumber: string | null;
  orderStatus: OrderStatus | null;
  recipientId: string;
  recipientName: string;
  recipientPhone: string | null;
  sentByName: string | null;
  to: string | null;
  twilioSid: string | null;
  error: string | null;
  skipped: boolean;
  skipReason: string | null;
};

export type SmsNotificationHistoryResponse = {
  items: SmsNotificationHistoryItem[];
  total: number;
  summary: {
    sent: number;
    failed: number;
    pending: number;
    read: number;
  };
};

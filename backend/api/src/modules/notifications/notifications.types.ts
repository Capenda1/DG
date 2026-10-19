import type {
  NotificationChannel,
  NotificationStatus,
  OrderStatus,
} from '@prisma/client';

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

export type OrderCustomerNotifyChannel = 'SMS' | 'EMAIL' | 'WHATSAPP';

export type OrderCustomerNotifyResult = {
  channel: OrderCustomerNotifyChannel;
  status: NotificationStatus;
  notificationId: string;
  body: string;
  to: string | null;
  whatsappUrl?: string;
  twilioSid?: string | null;
  error?: string | null;
};

export type OrderCustomerNotificationItem = {
  id: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  title: string;
  body: string;
  createdAt: string;
  sentAt: string | null;
  sentByName: string | null;
  to: string | null;
  twilioSid: string | null;
  error: string | null;
  whatsappUrl: string | null;
  manual: boolean;
};

export type OrderCustomerNotificationsResponse = {
  items: OrderCustomerNotificationItem[];
  lastByChannel: {
    SMS: OrderCustomerNotificationItem | null;
    EMAIL: OrderCustomerNotificationItem | null;
    WHATSAPP: OrderCustomerNotificationItem | null;
  };
  contacts: {
    phone: string | null;
    phoneE164: string | null;
    email: string | null;
    name: string;
  };
  channelsReady: {
    SMS: boolean;
    EMAIL: boolean;
    WHATSAPP: boolean;
  };
  smsSendMode: 'manual' | 'automatic';
  smsInactiveReason: string | null;
  emailInactiveReason: string | null;
};

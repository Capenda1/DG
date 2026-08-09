export const DESIGNER_CHAT_OPEN_EVENT = "dadiva-designer-chat-open" as const;

export type DesignerChatOpenDetail = { orderId: string };

export function openDesignerOrderChat(orderId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DesignerChatOpenDetail>(DESIGNER_CHAT_OPEN_EVENT, {
      detail: { orderId },
    }),
  );
}

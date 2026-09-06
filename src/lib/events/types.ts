/** Eventos de domínio — comunicação desacoplada entre módulos (outbox `domain_events`). */
export type DomainEventType =
  | "PRODUCT_EXPIRING"
  | "PRODUCT_EXPIRED"
  | "POST_PUBLISHED"
  | "POST_FAILED"
  | "AUTOMATION_FAILED";

export type ProductExpiringPayload = {
  expirationId: string;
  productId: string;
  productName: string;
  quantity: number;
  daysLeft: number;
  expirationDate: string;
};

export type ProductExpiredPayload = {
  expirationId: string;
  productId: string;
  productName: string;
  quantity: number;
  expirationDate: string;
};

export type PostPublishedPayload = {
  scheduledPostId: string;
  mediaName: string;
  publishedAt: string;
};

export type PostFailedPayload = {
  scheduledPostId: string;
  mediaName: string;
  errorMessage: string;
};

export type DomainEventPayloadMap = {
  PRODUCT_EXPIRING: ProductExpiringPayload;
  PRODUCT_EXPIRED: ProductExpiredPayload;
  POST_PUBLISHED: PostPublishedPayload;
  POST_FAILED: PostFailedPayload;
  AUTOMATION_FAILED: { ruleId: string; ruleName: string; error: string };
};

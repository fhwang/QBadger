export interface HandlerConfig {
  botUsername: string;
  targetRepo: string;
  sessionTimeoutHours: number;
  maxCiRetries: number;
  transcriptDir: string;
  transcriptRetentionDays: number;
}

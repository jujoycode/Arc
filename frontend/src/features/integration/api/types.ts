export interface RepositoryConnection { id: number; provider: 'GITHUB' | 'GITLAB'; repository: string; status: 'ACTIVE' | 'DISABLED' | 'DISCONNECTED'; webhookUrl: string }
export interface ConnectionList { enabled: boolean; items: RepositoryConnection[] }
export interface Delivery { id: number; deliveryId: string; event: string; status: 'PENDING' | 'FAILED' | 'COMPLETED'; attempts: number; error?: string | null; createdAt: string }
export interface DevelopmentLink { id: number; provider: 'GITHUB' | 'GITLAB'; repository: string; connectionStatus: string; kind: 'COMMIT' | 'CHANGE_REQUEST'; title: string; state: string; url: string; updatedAt: string }

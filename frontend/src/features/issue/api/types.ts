import type * as v from 'valibot'
import type { issueSchema } from './schemas'

/** Server shape is derived from runtime validation; legacy fixtures may omit custom values. */
export type Issue = Omit<v.InferOutput<typeof issueSchema>, 'customFields'> & { customFields?: Record<string, string | number | null> }
export interface Relation { id: number; fromId: number; toId: number; type: 'BLOCKS' | 'PRECEDES' }

/** The common work item. Issue remains the existing HTTP/storage contract. */
export type Ticket = Issue
export interface Comment { id: number; body: string; authorId: number; authorName: string; createdAt: string }

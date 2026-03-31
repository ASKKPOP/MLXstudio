/**
 * SSE (Server-Sent Events) broadcaster.
 * Replaces Electron IPC push events — all real-time events from the management
 * server flow through this to connected browser clients.
 */
import type { Response } from 'express'

interface SseClient {
  id: string
  res: Response
}

class EventBroadcaster {
  private clients = new Map<string, SseClient>()

  /** Register a new SSE connection */
  addClient(id: string, res: Response): void {
    this.clients.set(id, { id, res })
  }

  /** Remove a disconnected client */
  removeClient(id: string): void {
    this.clients.delete(id)
  }

  /** Broadcast an event to all connected clients */
  broadcast(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const [id, client] of this.clients) {
      try {
        client.res.write(payload)
      } catch {
        this.clients.delete(id)
      }
    }
  }

  get clientCount(): number {
    return this.clients.size
  }
}

export const broadcaster = new EventBroadcaster()

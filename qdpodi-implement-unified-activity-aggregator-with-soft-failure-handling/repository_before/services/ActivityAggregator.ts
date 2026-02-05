/**
 * @interface UnifiedEvent
 * The standardized format for all activities in the feed.
 */
export interface UnifiedEvent {
  id: string;          // Internal unique ID (UUID)
  source: string;      // 'GIT' | 'TICKET' | 'SYSTEM'
  externalId: string;  // ID from the original source system
  title: string;
  description: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

export interface ActivitySource {
  name: string;
  fetchEvents(projectId: string): Promise<UnifiedEvent[]>;
}

/**
 * Aggregator response structure including health status of the fetch operation.
 */
export interface AggregatorResponse {
  events: UnifiedEvent[];
  status: 'success' | 'partially_complete';
  failedSources: string[];
}

export class ActivityAggregator {
  private sources: ActivitySource[] = [];

  constructor(sources: ActivitySource[]) {
    this.sources = sources;
  }

  /**
   * Fetches, merges, de-duplicates, and sorts events from all registered sources.
   * @param projectId - The project to aggregate data for.
   * @param limit - Number of events to return.
   */
  async getRecentActivity(projectId: string, limit: number = 20): Promise<AggregatorResponse> {
    // TODO: Execute fetchEvents for all sources in parallel.
    // TODO: Handle individual source failures gracefully.
    // TODO: De-duplicate events by externalId.
    // TODO: Sort by timestamp DESC.
    // TODO: Truncate to the requested limit.
    
    return {
      events: [],
      status: 'success',
      failedSources: []
    };
  }
}

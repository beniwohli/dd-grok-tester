export interface Sample {
  id: string;
  text: string;
}

export interface ParseResult {
  parsed?: any;
  matched_rule?: string;
  error?: string;
  isLoading: boolean;
}

export interface HistoryItem {
  id: string;
  name?: string;
  timestamp: number;
  matchRules: string;
  supportRules: string;
  samples: Sample[];
}

export interface DDImportCandidate {
  // Stable key used for checkbox tracking — derived from pipeline name + processor
  // index so it doesn't depend on generateId() and stays consistent across re-renders
  // of the same dialog session.
  key: string;
  name: string;
  matchRules: string;
  supportRules: string;
  samples: Sample[];
}

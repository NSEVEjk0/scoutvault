export type BountyStatus = 'open' | 'claimed' | 'submitted' | 'paid' | 'cancelled' | 'disputed';
export type BountyCategory = 'housing' | 'shop' | 'campus';
export type CheckAnswer = 'yes' | 'no' | 'unclear';

export interface ChecklistItem {
  id: string;
  question: string;
  sourceClaim: string;
  hint: string;
}

export interface ListingBaseline {
  url: string;
  title: string;
  description: string;
  address: string;
  price: string;
  checklist: ChecklistItem[];
  capturedAt: string;
  sourceHash: string;
  provider: 'firecrawl' | 'manual';
  sourceReceipt?: string;
  warnings: string[];
}

export interface Bounty {
  id: string;
  chainId: string;
  title: string;
  description: string;
  category: BountyCategory;
  area: string;
  address?: string;
  latitude: number;
  longitude: number;
  distanceMeters?: number;
  reward: string;
  tokenSymbol: string;
  status: BountyStatus;
  buyerWallet: string;
  scoutWallet?: string;
  createdAt: string;
  expiresAt: string;
  checklist: ChecklistItem[];
  baseline: ListingBaseline;
  escrowAddress: string;
  fundingSignature: string;
  claimSignature?: string;
  reportSignature?: string;
  payoutSignature?: string;
  isDemo: boolean;
  report?: FieldReport;
}

export interface FieldReport {
  id: string;
  bountyId: string;
  scoutWallet: string;
  submittedAt: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  captureSource: 'android-camera' | 'web-camera' | 'demo-sample';
  answers: Record<string, CheckAnswer>;
  note: string;
  photoHash: string;
  photoUrl?: string;
  manifestHash: string;
  walletSignature: string;
  chainSignature: string;
  challenge: string;
  freshnessLabel: string;
  manifest?: Record<string, unknown>;
}

export interface PublicConfig {
  network: 'devnet' | 'localnet';
  rpcUrl: string;
  programId: string;
  mint: string;
  tokenSymbol: string;
  tokenDecimals: number;
  arbiterWallet: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  apiUrl: string;
  firecrawlEnabled: boolean;
  elevenLabsEnabled: boolean;
  androidDownloadUrl?: string;
  demoEnabled: boolean;
  settlementReady: boolean;
}

export interface AuthSession {
  token: string;
  wallet: string;
  expiresAt: string;
  isDemo: boolean;
}

export interface Challenge {
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface CaptureChallenge extends Challenge {
  instruction: string;
  code: string;
}

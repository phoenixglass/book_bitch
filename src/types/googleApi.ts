// Minimal types for the Google Identity Services (OAuth token client), Google
// Picker API, and Google Docs API response shapes used by useDriveImport.
// These aren't the full official schemas — just the fields this app reads.

export interface GoogleTokenResponse {
  access_token?: string;
}

export interface GoogleTokenClient {
  requestAccessToken: () => void;
}

export interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: GoogleTokenResponse) => void;
  error_callback: (error: unknown) => void;
}

export interface GooglePickerDocument {
  id: string;
  name: string;
  mimeType: string;
}

export interface GooglePickerData {
  action: string;
  docs?: GooglePickerDocument[];
}

export interface GooglePickerInstance {
  setVisible: (visible: boolean) => void;
}

export interface GooglePickerBuilder {
  addView: (viewId: string) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setCallback: (callback: (data: GooglePickerData) => void | Promise<void>) => GooglePickerBuilder;
  build: () => GooglePickerInstance;
}

declare global {
  interface Window {
    gapi: {
      load: (api: string, callback: () => void) => void;
    };
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient;
        };
      };
      picker: {
        PickerBuilder: new () => GooglePickerBuilder;
        ViewId: { DOCS: string };
        Action: { PICKED: string };
      };
    };
  }
}

// ── Google Docs API document shape ──────────────────────────────────────────

export interface GDocMagnitude {
  magnitude?: number;
}

export interface GDocParagraphStyle {
  namedStyleType?: string;
  alignment?: string;
  indentFirstLine?: GDocMagnitude;
  indentStart?: GDocMagnitude;
  lineSpacing?: number;
  spaceAbove?: GDocMagnitude;
  spaceBelow?: GDocMagnitude;
  // Stable per-heading ID assigned by Google Docs; survives edits to the
  // heading text, so it can be used to match a heading across renames.
  headingId?: string;
}

export interface GDocColor {
  color?: { rgbColor?: { red?: number; green?: number; blue?: number } };
}

export interface GDocTextStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  baselineOffset?: string;
  link?: { url?: string };
  fontSize?: GDocMagnitude;
  weightedFontFamily?: { fontFamily?: string };
  foregroundColor?: GDocColor;
  backgroundColor?: GDocColor;
}

export interface GDocTextRun {
  content: string;
  textStyle?: GDocTextStyle;
}

export interface GDocParagraphElement {
  textRun?: GDocTextRun;
  inlineObjectElement?: unknown;
}

export interface GDocBullet {
  nestingLevel?: number;
  listId?: string;
}

export interface GDocParagraph {
  paragraphStyle?: GDocParagraphStyle;
  bullet?: GDocBullet;
  elements?: GDocParagraphElement[];
}

export interface GDocTableCell {
  content?: GDocElement[];
}

export interface GDocTableRow {
  tableCells?: GDocTableCell[];
}

export interface GDocTable {
  tableRows?: GDocTableRow[];
}

export interface GDocElement {
  paragraph?: GDocParagraph;
  table?: GDocTable;
}

export interface GDocTabProperties {
  title?: string;
  tabId?: string;
  index?: number;
}

export interface GDocTab {
  tabProperties?: GDocTabProperties;
  documentTab?: { body?: { content?: GDocElement[] } };
  childTabs?: GDocTab[];
}

export interface GDocDocument {
  title?: string;
  tabs?: GDocTab[];
  body?: { content?: GDocElement[] };
}

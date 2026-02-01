import { ModeOption } from './expression';

export type LicenseOption = 'all-rights-reserved' | 'cc-by' | 'cc0' | 'cc-by-sa';

export const LICENSE_OPTIONS: {
  value: LicenseOption;
  label: string;
  description: string;
  url: string | null;
}[] = [
  {
    value: 'all-rights-reserved',
    label: 'All rights reserved',
    description: 'Others cannot reuse or remix without your permission.',
    url: null,
  },
  {
    value: 'cc-by',
    label: 'Free to remix / Reuse (CC BY)',
    description: 'Others can remix and share with credit to you.',
    url: 'https://creativecommons.org/licenses/by/4.0/',
  },
  {
    value: 'cc0',
    label: 'Public domain (CC0)',
    description: 'No restrictions. Anyone can use for any purpose.',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  {
    value: 'cc-by-sa',
    label: 'Share alike (CC BY-SA)',
    description: 'Others can remix with credit, but must use the same license.',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
];

export const DEFAULT_LICENSE: LicenseOption = 'cc-by';

export interface PostMetadataModel {
  title: string;
  description: string;
  mode: ModeOption;
  sampleRate: number;
  isDraft: boolean;
  license: LicenseOption;
  autoSkipDuration: number | null;
}

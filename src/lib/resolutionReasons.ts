export const OTHER_RESOLUTION_REASON = 'Other';

export const RESOLUTION_REASON_GROUPS = [
  {
    label: 'Invoice and weight',
    options: [
      'Invoice number corrected',
      'Invoice number verified',
      'Zero weight confirmed',
      'Weight corrected',
      'Duplicate or conflict reviewed',
    ],
  },
  {
    label: 'Territory and account',
    options: [
      'Territory is correct',
      'Territory corrected',
      'Territory is correct — account shared across branches',
      'Territory confirmed after review',
      'Account added to master file',
      'CCL internal account confirmed',
    ],
  },
  {
    label: 'Driver and delivery',
    options: [
      'Repair job confirmed',
      'Redelivery confirmed',
      'Driver assignment confirmed',
      'Multiple drivers at this address confirmed',
    ],
  },
  { label: 'Other', options: [OTHER_RESOLUTION_REASON] },
] as const;

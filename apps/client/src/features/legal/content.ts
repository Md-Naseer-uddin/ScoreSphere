/**
 * Privacy notice and terms (DPDP Act 2023). Written plainly for the pilot; a lawyer must
 * review both before public launch (plan §7), which the pages say.
 */
export interface LegalSection {
  title: string;
  points: string[];
}

export const LEGAL_UPDATED = '14 November 2026';

export const privacySections: LegalSection[] = [
  {
    title: 'What we collect',
    points: [
      'Your mobile number, name and password (stored only as a secure hash). Optionally your email, photo, city and a short bio.',
      'The teams, rosters and matches you create or score, including the names of players you add.',
      'Which devices are signed in to your account, so you can see and sign them out.',
      'We do not collect your location, contacts or anything from your phone beyond what you type into ScoreSphere.',
    ],
  },
  {
    title: 'Why we use it',
    points: [
      'To run your account and keep it secure: sign-in, recovery and device management.',
      'To keep scores, statistics and awards for your matches, and share them only where you choose.',
      'To let teammates find you by mobile number only if you turn that on; it is off by default.',
    ],
  },
  {
    title: 'Who sees it',
    points: [
      'Members of a workspace see that workspace’s teams, rosters and matches.',
      'Anyone with a live link you create sees that match’s score and player names, until you revoke the link or it expires.',
      'We never sell your data or show it to advertisers. Mobile numbers are never shown to other users or in public links.',
    ],
  },
  {
    title: 'Children',
    points: [
      'Accounts are for people aged 18 or over. Younger players can appear only as roster members added by their school, club or academy, which is responsible for having their guardian’s consent.',
    ],
  },
  {
    title: 'How long we keep it',
    points: [
      'Your account data stays while you have an account.',
      'Match records belong to the workspace that played them and stay as long as it keeps them.',
      'Security logs are kept for a limited period to protect accounts.',
    ],
  },
  {
    title: 'Your rights',
    points: [
      'Download a copy of your data at any time from Profile → Your data.',
      'Correct your details from your profile.',
      'Delete your account from Profile → Your data. Your number and personal details are erased; organisations keep their own match records, no longer linked to you.',
      'For anything else, or to complain, contact the ScoreSphere grievance officer through the support address on the download page.',
    ],
  },
];

export const termsSections: LegalSection[] = [
  {
    title: 'Using ScoreSphere',
    points: [
      'You must be 18 or older to create an account, and give a mobile number you are allowed to use.',
      'Keep your password and recovery code safe. You are responsible for what happens under your account.',
    ],
  },
  {
    title: 'What you add',
    points: [
      'Only add people to rosters and matches if you have a right to: for minors, the organisation needs their guardian’s consent.',
      'Do not use ScoreSphere for betting, or share live links where they will be used for it.',
    ],
  },
  {
    title: 'Scores and rules',
    points: [
      'ScoreSphere follows the rules you choose, but the scorer and officials decide what happened on the field.',
      'Rules summaries in the app are guides; the governing bodies’ published rules are authoritative.',
    ],
  },
  {
    title: 'Changes and ending',
    points: [
      'We may update these terms and will tell you in the app before changes take effect.',
      'You can delete your account at any time. We may suspend accounts that misuse the service.',
    ],
  },
];

/**
 * Keyword -> canned reply rules for the M4 auto-reply demo. First matching
 * rule (in array order) wins; ties broken by declaration order so more
 * specific topics should be listed before generic ones.
 */
export interface AutoReplyRule {
  topic: string;
  keywords: string[];
  reply: string;
}

export const AUTO_REPLY_RULES: AutoReplyRule[] = [
  {
    topic: 'admission',
    keywords: ['admission', 'admit', 'apply', 'application', 'enroll', 'enrol'],
    reply:
      "Thanks for reaching out! For admissions, you'll need your previous mark sheet, a transfer certificate, and a passport-size photo. " +
      'Our admissions desk will follow up shortly with the full process and next available dates.',
  },
  {
    topic: 'fee',
    keywords: ['fee', 'fees', 'cost', 'price', 'payment'],
    reply:
      'Thanks for your enquiry about fees! Fee structures vary by course. ' +
      'A counselor will share the exact breakdown for your program shortly.',
  },
  {
    topic: 'scholarship',
    keywords: ['scholarship', 'scholership', 'discount', 'financial aid'],
    reply:
      'We do offer merit-based scholarships for eligible students. ' +
      'A counselor will get back to you with the eligibility criteria and how to apply.',
  },
  {
    topic: 'results',
    keywords: ['result', 'results', 'entrance exam', 'exam date', 'merit list'],
    reply:
      'Thanks for checking in on results! Dates are announced on our notice board and website closer to the exam. ' +
      "We'll make sure someone confirms the exact date for you.",
  },
  {
    topic: 'visit',
    keywords: ['campus visit', 'visit', 'tour', 'timing', 'timings', 'hours', 'open'],
    reply:
      'Happy to help you plan a visit! Our campus is open Monday-Saturday, 9 AM - 5 PM. ' +
      "A counselor will help you schedule a specific time that works for you.",
  },
  {
    topic: 'hostel',
    keywords: ['hostel', 'accommodation', 'stay', 'boarding'],
    reply:
      'Yes, hostel facilities are available for outstation students. ' +
      'A counselor will share availability and charges with you shortly.',
  },
];

const GREETING_REPLY =
  "Hi! Thanks for messaging us. We've received your enquiry and a counselor will get back to you shortly. " +
  'In the meantime, feel free to ask about admissions, fees, scholarships, or campus visits.';

/**
 * Matches free-text against AUTO_REPLY_RULES (case-insensitive substring
 * match). Falls back to a generic acknowledgment when nothing matches, so
 * every first-touch enquiry gets an instant reply even if we can't identify
 * the topic.
 */
export function matchAutoReply(text: string): string {
  const normalized = text.toLowerCase();
  for (const rule of AUTO_REPLY_RULES) {
    if (rule.keywords.some((kw) => normalized.includes(kw))) {
      return rule.reply;
    }
  }
  return GREETING_REPLY;
}

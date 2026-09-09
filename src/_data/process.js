/** How an engagement runs, start to finish. */
export default [
  {
    title: 'Diagnose where work breaks',
    lede: 'Before anything is built, the operation is mapped as it actually runs — not as the org chart says it runs.',
    detail: 'Where work enters, who has to remember what, where things wait, what nobody can see, and what breaks when volume doubles. The public website gets a structural read as part of this.',
    output: 'A one-page map of the failure points, ranked by cost.',
    duration: '1 week'
  },
  {
    title: 'Design the operational system',
    lede: 'The smallest system that removes the worst leaks first.',
    detail: 'Which pieces are public-facing, which run in the back office, what fires automatically, and what stays human. Every module is tied to a failure point from the diagnosis.',
    output: 'A written scope with a fixed number on it, and the first build named.',
    duration: '1 week'
  },
  {
    title: 'Build and integrate it',
    lede: 'Built in the tools you already pay for wherever possible, replaced only where they genuinely fail.',
    detail: 'Working software in front of the people who will use it every week, not a reveal at the end. Integrations and automations are wired as the modules land.',
    output: 'The first build live, with real records in it.',
    duration: '3–8 weeks'
  },
  {
    title: 'Launch, observe, and improve it',
    lede: 'A system is only finished once it is the way work gets done.',
    detail: 'Launch with the team, watch where it is bypassed, and fix the reasons. Metrics from the diagnosis are re-measured against the new baseline.',
    output: 'Measured change against the original failure points, and a maintenance plan.',
    duration: 'Ongoing'
  }
];

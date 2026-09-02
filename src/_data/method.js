// How I read a system when I audit one. My own diagnostic method — this is the
// section that pairs with the analyzer feature on the home page.
export default [
  {
    title: 'Where work enters',
    desc: 'Forms, inboxes, calls — every entry point into the business',
    status: 'INPUT'
  },
  {
    title: 'Who has to remember',
    desc: 'Every handoff that depends on a person recalling it',
    status: 'RISK'
  },
  {
    title: 'Where it waits',
    desc: 'Queues, approvals, and the delays nobody measures',
    status: 'RISK'
  },
  {
    title: 'What nobody can see',
    desc: 'Decisions made on stale data because there is no live view',
    status: 'RISK'
  },
  {
    title: 'What breaks at scale',
    desc: 'The step that fails the moment volume doubles',
    status: 'BREAK'
  }
];

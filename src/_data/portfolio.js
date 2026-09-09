import projects from './projects.js';

// Presentation adapter for the case-study templates. projects.js stays the
// single source of facts; this only maps fields, picks screenshots, and orders.
const featureOrder = ['spade-website', 'meridian', 'st-clair'];
// Real screenshots only. Projects without one render without an image.
const images = { 'spade-website': 'spade', meridian: 'meridian', 'st-clair': 'st-clair' };
const notes = {
  meridian: 'Portfolio demo, not a live medical transport operation. Any demo testimonials inside it are placeholders, not endorsements.',
  'st-clair': 'Independent redesign concept. It does not imply an official client relationship or a production booking system.',
  'delta-one': 'Speculative cold-outreach pitch, not commissioned client work.',
  rankking: 'The SaaS version at rankking.io is planned and is not presented as a launched product.',
  'spade-website': 'The screenshot shows the public website. Internal application screens are not publicly displayed.'
};
const kinds = { live: 'Application', internal: 'Internal tool', built: 'Application', demo: 'Portfolio demo', concept: 'Redesign concept', plugin: 'WordPress plugin' };

export default projects
  .map((project) => ({
    ...project,
    title: project.name,
    kind: project.kind || kinds[project.status] || 'Project',
    field: project.category,
    tech: project.stack || [],
    features: project.facts || [],
    image: images[project.slug],
    featured: featureOrder.includes(project.slug),
    role: project.role || 'Design and development',
    context: project.context || project.summary,
    approach: project.approach || project.summary,
    result: project.result || (project.facts || []).join(' · '),
    note: notes[project.slug] || (project.status === 'internal' ? 'Internal tool. Contact me to discuss the implementation.' : null),
    url: project.slug === 'spade-website' ? 'https://spadesecurityservices.com' : project.url,
    linkLabel: project.status === 'demo' ? 'Explore demo' : project.status === 'concept' ? 'Explore concept' : 'Visit website'
  }))
  .sort((a, b) => {
    const ai = featureOrder.indexOf(a.slug), bi = featureOrder.indexOf(b.slug);
    return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi);
  });

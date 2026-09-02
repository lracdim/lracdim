import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { schemaTypes } from './schemas'

export default defineConfig({
  name: 'jc-portfolio',
  title: 'J.C Portfolio',

  projectId: 'z921l2to',
  dataset: 'production',

  plugins: [structureTool()],

  schema: {
    types: schemaTypes,
  },
})

import { defineType, defineField } from 'sanity'

export const executionLog = defineType({
  name: 'executionLog',
  title: 'Execution Logs',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'date',
      title: 'Date',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'architecture',
      title: 'Architecture',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'performance',
      title: 'Performance Gain',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{ type: 'string' }],
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'context',
      title: 'Context',
      type: 'text',
      rows: 3,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'problem',
      title: 'Problem',
      type: 'text',
      rows: 4,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'approach',
      title: 'Approach',
      type: 'text',
      rows: 4,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'outcomes',
      title: 'Outcomes',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'label', title: 'Label', type: 'string' },
            { name: 'value', title: 'Value', type: 'string' },
          ],
        },
      ],
    }),
  ],
  preview: {
    select: {
      title: 'title',
      architecture: 'architecture',
      performance: 'performance',
    },
    prepare({ title, architecture, performance }) {
      return {
        title,
        subtitle: `${architecture} • ${performance}`,
      }
    },
  },
})

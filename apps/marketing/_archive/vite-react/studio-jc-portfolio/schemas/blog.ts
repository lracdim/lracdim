import { defineType, defineField } from 'sanity'

export const blog = defineType({
  name: 'blog',
  title: 'Terminal (Blog)',
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
      name: 'publishedAt',
      title: 'Published At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {
        list: [
          { title: 'Architecture', value: 'Architecture' },
          { title: 'Strategy', value: 'Strategy' },
          { title: 'Automation', value: 'Automation' },
          { title: 'Development', value: 'Development' },
          { title: 'Communication', value: 'Communication' },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'excerpt',
      title: 'Excerpt',
      type: 'text',
      rows: 3,
      validation: (Rule) => Rule.required().max(300),
    }),
    defineField({
      name: 'content',
      title: 'Content',
      type: 'array',
      of: [{ type: 'block' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'readTime',
      title: 'Read Time (minutes)',
      type: 'number',
      initialValue: 5,
    }),
  ],
  preview: {
    select: {
      title: 'title',
      category: 'category',
      date: 'publishedAt',
    },
    prepare({ title, category, date }) {
      return {
        title,
        subtitle: `${category} • ${new Date(date).toLocaleDateString()}`,
      }
    },
  },
})

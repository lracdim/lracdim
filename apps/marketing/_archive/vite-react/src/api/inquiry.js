export const inquiry = {
  async submit(formData) {
    try {
      const response = await fetch('/api/inquiry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })
      
      if (!response.ok) {
        throw new Error('Failed to submit inquiry')
      }
      
      return await response.json()
    } catch (error) {
      console.error('Inquiry submission error:', error)
      throw error
    }
  }
}

export default inquiry

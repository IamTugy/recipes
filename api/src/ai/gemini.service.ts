import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GoogleGenAI } from '@google/genai'

@Injectable()
export class GeminiService {
  private client: GoogleGenAI | null = null
  private readonly model = 'gemini-3.5-flash'

  constructor(private readonly config: ConfigService) {}

  private getClient(): GoogleGenAI {
    if (!this.client) {
      const apiKey = this.config.get<string>('GEMINI_API_KEY')
      if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')
      this.client = new GoogleGenAI({ apiKey })
    }
    return this.client
  }

  // Used when the caller needs the response parsed as JSON - the prompt
  // itself must instruct Gemini on the exact shape to return, since this
  // relies on responseMimeType rather than a strict schema object (keeps
  // this method resilient to SDK schema-type API changes across versions).
  async generateStructured<T>(prompt: string): Promise<T> {
    const client = this.getClient()
    const response = await client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    })
    if (!response.text) throw new Error('Gemini returned an empty response')
    return JSON.parse(response.text) as T
  }

  // Plain text generation, no JSON constraint - not used by the recipe
  // import feature, but exists now so a future chat feature can call
  // GeminiService directly without needing changes here.
  async generateText(prompt: string): Promise<string> {
    const client = this.getClient()
    const response = await client.models.generateContent({ model: this.model, contents: prompt })
    if (!response.text) throw new Error('Gemini returned an empty response')
    return response.text
  }
}

import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GoogleGenAI, Modality } from '@google/genai'

export interface EditedImage {
  data: string
  mimeType: string
}

@Injectable()
export class GeminiService {
  private client: GoogleGenAI | null = null
  private readonly model = 'gemini-3.5-flash'
  private readonly imageModel = 'gemini-2.5-flash-image'

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
  async generateStructured<T>(prompt: string, temperature?: number): Promise<T> {
    const client = this.getClient()
    const generate = () => client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: { responseMimeType: 'application/json', ...(temperature !== undefined ? { temperature } : {}) },
    })
    const response = await generate()
    if (!response.text) throw new Error('Gemini returned an empty response')
    try {
      return JSON.parse(response.text) as T
    } catch {
      // Malformed JSON from the model is rare (e.g. an unescaped quote inside
      // generated text breaking the surrounding string) but not unheard of -
      // one retry almost always comes back clean rather than surfacing a
      // hard failure to the caller for something transient.
      const retry = await generate()
      if (!retry.text) throw new Error('Gemini returned an empty response')
      return JSON.parse(retry.text) as T
    }
  }

  // Same JSON-structured contract as generateStructured, but with an image
  // attached - used by the recipe quality review, which needs to judge the
  // photo alongside the recipe text (does it match the dish, is it usable
  // quality) in one call rather than a separate vision pass.
  async generateStructuredWithImage<T>(prompt: string, imageBase64: string, mimeType: string, temperature?: number): Promise<T> {
    const client = this.getClient()
    const generate = () => client.models.generateContent({
      model: this.model,
      contents: [{ role: 'user', parts: [{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }] }],
      config: { responseMimeType: 'application/json', ...(temperature !== undefined ? { temperature } : {}) },
    })
    const parseOnce = async (): Promise<T> => {
      const response = await generate()
      if (!response.text) throw new Error('Gemini returned an empty response')
      // A response cut off by the output token cap can still happen to end on
      // valid JSON syntax (e.g. mid-array), which would parse "successfully"
      // into truncated content instead of throwing - catch that case explicitly
      // rather than risk silently truncated data downstream.
      if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
        throw new Error('Gemini response was cut off by the output token limit')
      }
      return JSON.parse(response.text) as T
    }
    try {
      return await parseOnce()
    } catch (err) {
      // Only malformed JSON is worth retrying - it's a transient formatting
      // slip, not a real problem with the request. Empty-response and
      // MAX_TOKENS errors are left to propagate immediately.
      if (err instanceof SyntaxError) return await parseOnce()
      throw err
    }
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

  // Grounds the response in live Google Search results, for research tasks
  // (e.g. "find the best existing recipe for X") rather than pure generation
  // from training data. The Gemini API rejects combining the googleSearch
  // tool with responseMimeType/JSON output, so this only returns text plus
  // the source URLs the model actually cited - callers that need structured
  // JSON should feed this text into generateStructured as a second step.
  async generateWithSearch(prompt: string): Promise<{ text: string; sources: { title: string; url: string }[] }> {
    const client = this.getClient()
    const response = await client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    })
    if (!response.text) throw new Error('Gemini returned an empty response')

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []
    const seen = new Set<string>()
    const sources = chunks
      .map(chunk => chunk.web)
      .filter((web): web is { uri: string; title?: string } => !!web?.uri)
      // Dedupe by title, not uri: Gemini's search grounding gives each citation
      // its own Vertex AI redirect URL, so the same source cited multiple times
      // produces distinct uris that all resolve to the same page.
      .filter(web => {
        const key = web.title ?? web.uri
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map(web => ({ title: web.title ?? web.uri, url: web.uri }))

    return { text: response.text, sources }
  }

  // Sends an existing image back to Gemini's image model along with an edit
  // instruction and returns the regenerated image bytes - used for the
  // "enhance picture" feature, which asks for a minimal retouch rather than
  // a from-scratch generation.
  async editImage(imageBase64: string, mimeType: string, prompt: string): Promise<EditedImage> {
    const client = this.getClient()
    const response = await client.models.generateContent({
      model: this.imageModel,
      contents: [{ role: 'user', parts: [{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }] }],
      config: { responseModalities: [Modality.IMAGE] },
    })
    const parts = response.candidates?.[0]?.content?.parts ?? []
    const image = parts.find(part => part.inlineData?.data)?.inlineData
    if (!image?.data) throw new Error('Gemini returned no image')
    return { data: image.data, mimeType: image.mimeType ?? 'image/png' }
  }
}

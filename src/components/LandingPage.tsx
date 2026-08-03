import { SignIn } from '@clerk/react'
import { useLanguage } from '../hooks/useLanguage'

export default function LandingPage() {
  const { lang } = useLanguage()

  const features = [
    {
      icon: '🤖',
      title: lang === 'he' ? 'כתיבה בעזרת AI, מתכונים של בני אדם' : 'AI-assisted writing, human-made recipes',
      body: lang === 'he'
        ? 'כל מתכון נכתב על ידי אדם - ה-AI רק עוזר בעבודה המשעממת (ייבוא מקישור, תמונה או PDF). עוזר טייס, לא הטייס.'
        : 'Every recipe is written by a person - AI just helps with the busywork (import from a link, photo, or PDF). Co-pilot, not the pilot.',
    },
    {
      icon: '🌐',
      title: lang === 'he' ? 'דו-לשוני מהיסוד' : 'Bilingual by default',
      body: lang === 'he'
        ? 'כל מתכון קיים בעברית ובאנגלית, עם תרגום אוטומטי בכל מקום.'
        : 'Every recipe lives in Hebrew and English, with auto-translate throughout.',
    },
    {
      icon: '🗓️',
      title: lang === 'he' ? 'תכנון ארוחות ורשימת קניות' : 'Meal planning + shopping list',
      body: lang === 'he'
        ? 'תכננו ארוחות לאורך השבוע וקבלו רשימת קניות אחת מרוכזת.'
        : 'Plan meals across the week and get one combined shopping list.',
    },
    {
      icon: '✅',
      title: lang === 'he' ? 'נבדק לפני שהוא עולה' : "Checked before it's added",
      body: lang === 'he'
        ? 'כל מתכון נבדק לפני שהוא מתפרסם, כדי שכלום חצי-מתוכנן לא יגיע.'
        : "Every recipe is reviewed before it's published, so nothing half-tested makes it in.",
    },
  ]

  return (
    <div className="min-h-dvh bg-bg px-6 py-16 sm:py-24">
      <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-12 items-start">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-cream mb-3">
            {lang === 'he' ? "ספר הבישול של טוגי" : "Tugy's Cookbook"}
          </h1>
          <p className="text-cream/60 text-base sm:text-lg mb-10">
            {lang === 'he'
              ? 'ספר בישול פרטי לאנשים שאני מבשל בשבילם - כל מתכון מתועד, דו-לשוני, ומוכן לבישול.'
              : "A personal cookbook for the people I cook for - every recipe documented, bilingual, and ready to cook."}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {features.map(f => (
              <div key={f.title} className="card p-4">
                <div className="text-2xl mb-2">{f.icon}</div>
                <h2 className="text-sm font-semibold text-cream mb-1">{f.title}</h2>
                <p className="text-xs text-cream/50">{f.body}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-cream/30 mt-8">
            {lang === 'he' ? 'יש לכם רעיון? אפשר לבקש תכונה חדשה אחרי ההתחברות.' : 'Have an idea? You can request a feature once you\'re in.'}
          </p>
        </div>

        <div className="flex justify-center sm:justify-end">
          <SignIn />
        </div>
      </div>
    </div>
  )
}

import type { Recipe } from '../types'

export const recipes: Recipe[] = [
  {
    id: 'butter-chicken',
    title: "Butter Chicken",
    titleHe: "באטר צ'יקן",
    category: 'dinner',
    tags: ['עוף', 'קארי', 'הודי', 'עיקרית'],
    cuisine: 'Indian',
    image: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=900&q=80',
    description: 'עוף עסיסי במרינדת תבלינים ורוטב עגבניות עשיר עם שמנת — קלאסיק הודי שכובש את כולם.',
    prepTime: 30,
    cookTime: 60,
    servings: 6,
    difficulty: 'medium',
    featured: true,
    ingredients: [
      {
        group: 'עוף',
        items: [
          { amount: 1, unit: 'ק"ג', name: "פרגית או חזה עוף, חתוכה לקוביות 3-4 ס\"מ" },
        ],
      },
      {
        group: 'מרינדה',
        items: [
          { amount: 1, unit: 'כפית', name: 'גרגרי כוסברה' },
          { amount: 1, unit: 'כפית', name: 'זרעי כמון' },
          { amount: 1, unit: '', name: 'לימון, סחוט' },
          { amount: 3, unit: 'שיני', name: 'שום כתושות' },
          { amount: 30, unit: 'גרם', name: "ג'ינג'ר טרי מגורר" },
          { amount: 0.25, unit: 'כפית', name: 'הל טחון' },
          { amount: 0.5, unit: 'כפית', name: 'סוכר' },
          { amount: 1, unit: 'כפית', name: 'מלח' },
          { amount: 0.25, unit: 'כפית', name: "שבבי צ'ילי" },
          { amount: 1, unit: 'כפית', name: 'גראם מסאלה' },
        ],
      },
      {
        group: 'רוטב',
        items: [
          { amount: 80, unit: 'גרם', name: 'חמאה' },
          { amount: 1, unit: '', name: 'בצל קצוץ' },
          { amount: 20, unit: 'גרם', name: "ג'ינג'ר קצוץ" },
          { amount: 1, unit: 'כפית', name: 'גראם מסאלה' },
          { amount: 2, unit: '', name: 'עלי דפנה' },
          { amount: 0.5, unit: 'כפית', name: 'חילבה טחונה' },
          { amount: 0.5, unit: 'כפית', name: 'כורכום' },
          { amount: 1, unit: 'כפית', name: 'סוכר' },
          { amount: 700, unit: 'גרם', name: 'פסאטה עגבניות' },
          { amount: 100, unit: 'גרם', name: 'שמנת מתוקה' },
        ],
      },
    ],
    steps: [
      {
        title: 'מרינדה',
        items: [
          { instruction: 'קולים את גרגרי הכוסברה והכמון ומעבירים עם שאר חומרי המרינדה למעבד מזון — טוחנים היטב.' },
          { instruction: "מעסים את המרינדה אל קוביות העוף, מכסים ומשהים לפחות 3 שעות (עדיף 12 שעות) בקירור.", timerMinutes: 180, tip: 'ככל שהעוף ישהה יותר זמן במרינדה — הטעם עמוק יותר.' },
        ],
      },
      {
        title: 'רוטב',
        items: [
          { instruction: 'מחממים חמאה בסיר רחב ומזהיבים קלות. מטגנים בצל וג\'ינג\'ר עד ריכוך.' },
          { instruction: 'מוסיפים את התבלינים ומטגנים 30 שניות. מוסיפים לימון, פסאטה ושמנת מתוקה.' },
          { instruction: 'מביאים לרתיחה, מנמיכים ומצמצמים 30 דקות עד שהרוטב סמיך מאוד.', timerMinutes: 30 },
          { instruction: 'מסירים עלי דפנה, טוחנים את הרוטב ומסננים לסיר נקי.' },
        ],
      },
      {
        title: 'סיום',
        items: [
          { instruction: 'מחממים מחבת עם מעט שמן וצורבים את העוף להשחמה משני הצדדים.' },
          { instruction: 'מוסיפים את העוף לרוטב החם, מרתיחים 2-3 דקות ומוסיפים עלי כוסברה קצוצים.', timerMinutes: 3 },
          { instruction: 'מגישים עם אורז לבן מאודה.' },
        ],
      },
    ],
    tips: [
      'ניתן להכין את הרוטב כמה שעות מראש ולחמם לפני ההגשה.',
      'לגרסה כשרה — מחליפים חמאה בשמן קוקוס ושמנת מתוקה בקרם קוקוס.',
    ],
  },

  {
    id: 'sticky-chicken-wings',
    title: 'Sticky Chicken Wings',
    titleHe: 'כנפי עוף דביקות',
    category: 'dinner',
    tags: ['עוף', 'כנפיים', 'אסייתי', 'מנגל'],
    cuisine: 'Asian Fusion',
    image: 'https://images.unsplash.com/photo-1527477396000-e27163b481c2?w=900&q=80',
    description: 'כנפי עוף מבושלות ברוטב קרמל-חמוץ מתוק ואז צלויות לקבלת צריבה מבריקה ודביקה.',
    prepTime: 20,
    cookTime: 55,
    servings: 8,
    difficulty: 'easy',
    featured: true,
    ingredients: [
      {
        items: [
          { amount: 20, unit: '', name: 'כנפי עוף, מחולקות לשניים ונקיות' },
          { amount: 60, unit: 'גרם', name: 'סוכר' },
          { amount: 100, unit: 'גרם', name: 'חומץ טבעי' },
          { amount: 50, unit: 'גרם', name: 'מים' },
          { amount: 1, unit: 'כף', name: 'שמן שומשום' },
          { amount: 50, unit: 'גרם', name: 'רוטב סויה' },
          { amount: 50, unit: 'גרם', name: 'רוטב תמרהינדי' },
          { amount: 50, unit: 'גרם', name: 'קטשופ' },
          { amount: 50, unit: 'גרם', name: 'רוטב ברביקיו' },
          { amount: 4, unit: 'שיני', name: 'שום קצוצות' },
          { amount: 2, unit: 'ס"מ', name: "שורש ג'ינג'ר טרי קצוץ" },
          { amount: 1, unit: 'כף', name: 'סילאן' },
          { amount: 1, unit: 'כף', name: 'שומשום קלוי, לגיניש' },
        ],
      },
    ],
    steps: [
      {
        items: [
          { instruction: 'מנקים ומחצים את הכנפיים. מניחים על מגש ומסירים שאריות נוצות.' },
          { instruction: 'בסיר רחב יוצרים קרמל כהה מהסוכר. מוסיפים חומץ ואז את כל שאר חומרי הרוטב — מביאים לרתיחה.' },
          { instruction: 'מוסיפים כנפיים ומבשלים על להבה בינונית-נמוכה 20 דקות, הופכים וממשיכים עוד 20 דקות.', timerMinutes: 40 },
          { instruction: 'מוציאים את הכנפיים ומצמצמים את הרוטב לסירופ.' },
          { instruction: 'מסדרים כנפיים בשכבה אחת על תבנית ויוצקים רוטב מעל. צולים בתנור 220° כ-15 דקות עד לצריבה.', timerMinutes: 15, tip: 'הכנפיים בשיא הטעם כשהרוטב ממש מקורמל ודביק — אל תוציאו לפני.' },
          { instruction: 'מגישים עם שומשום קלוי מעל.' },
        ],
      },
    ],
  },

  {
    id: 'focaccia',
    title: 'Sea Salt & Rosemary Focaccia',
    titleHe: 'פוקאצ׳ה מלח ים ורוזמרין',
    category: 'bread',
    tags: ['לחם', 'איטלקי', 'שמן זית', 'צמחוני'],
    cuisine: 'Italian',
    image: 'https://images.unsplash.com/photo-1571047196671-26c2a6a53b55?w=900&q=80',
    description: 'פוקאצ׳ה אוורירית עם גומות שמן זית, מלח ים גס וענפי רוזמרין טרי — פשוטה, מרשימה ומנחמת.',
    prepTime: 30,
    cookTime: 15,
    servings: 8,
    difficulty: 'easy',
    ingredients: [
      {
        group: 'בצק',
        items: [
          { amount: 1, unit: 'ק"ג', name: 'קמח לחם' },
          { amount: 20, unit: 'גרם', name: 'מלח' },
          { amount: 40, unit: 'גרם', name: 'סוכר' },
          { amount: 15, unit: 'גרם', name: 'שמרים יבשים' },
          { amount: 680, unit: 'גרם', name: 'מים' },
          { amount: 50, unit: 'גרם', name: 'שמן זית' },
        ],
      },
      {
        group: 'לציפוי',
        items: [
          { amount: 3, unit: 'כפות', name: 'שמן זית' },
          { amount: 1, unit: 'כף', name: 'מלח ים גס' },
          { amount: 4, unit: 'ענפי', name: 'רוזמרין טרי' },
        ],
      },
    ],
    steps: [
      {
        items: [
          { instruction: 'מנפים את כל החומרים היבשים לקערה. מוסיפים מים ושמן בהדרגה תוך לישה במהירות נמוכה.' },
          { instruction: 'לשים 10 דקות עד לקבלת בצק חלק וגמיש — מעט דביק.', timerMinutes: 10 },
          { instruction: 'מניחים עטוף בקערה משומנת ומתפיחים עד הכפלת הנפח (~60 דקות).', timerMinutes: 60, tip: 'בצק טוב לא יחכה — אם הבצק תפח מהר, עברו לשלב הבא.' },
          { instruction: 'מחממים תנור ל-230°. מחלקים ל-4 חלקים ומניחים על משטח משומן ל-10 דקות מנוחה.', timerMinutes: 10 },
          { instruction: 'מותחים כל חלק לעלה בעובי 1 ס"מ, מניחים על תבנית משומנת ו"דוקרים" בעזרת האצבעות.' },
          { instruction: 'מורחים שמן זית, מפזרים מלח ים וענפי רוזמרין. מתפיחים עוד 15-20 דקות.', timerMinutes: 20 },
          { instruction: 'אופים 15 דקות עד הזהבה. מצננים מעט ופורסים.', timerMinutes: 15 },
        ],
      },
    ],
    tips: [
      'ככל שהגומות עמוקות יותר — כך יצטבר בהן יותר שמן זית ויתקבל מרקם עשיר יותר.',
      'ניתן להוסיף עגבניות שרי, זיתים או גבינה מעל לפני האפייה.',
    ],
  },

  {
    id: 'sfinge',
    title: 'Sfinge',
    titleHe: "ספינג'",
    category: 'snack',
    tags: ['טיגון', 'בצק שמרים', 'ספרדי-יהודי', 'מתוק'],
    cuisine: 'Sephardic',
    image: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=900&q=80',
    description: "ספינג' הם טבעות בצק שמרים מטוגנות רכות מבפנים ופריכות מבחוץ, מגולגלות בסוכר — מסורת ספרדית-יהודית.",
    prepTime: 20,
    cookTime: 30,
    servings: 35,
    difficulty: 'medium',
    ingredients: [
      {
        items: [
          { amount: 600, unit: 'גרם', name: 'קמח לחם קשה' },
          { amount: 20, unit: 'גרם', name: 'שמרים יבשים' },
          { amount: 80, unit: 'גרם', name: 'סוכר' },
          { amount: 10, unit: 'גרם', name: 'מלח' },
          { amount: 2, unit: '', name: 'ביצים' },
          { amount: 250, unit: 'גרם', name: 'מים' },
          { amount: 100, unit: 'גרם', name: 'מיץ תפוזים' },
          { amount: 50, unit: 'גרם', name: 'שמן קנולה' },
          { amount: 1, unit: 'כוס', name: 'סוכר לבן לטבילה' },
          { amount: 1, unit: 'ליטר', name: 'שמן לטיגון עמוק' },
        ],
      },
    ],
    steps: [
      {
        items: [
          { instruction: 'מכניסים את כל חומרי הבצק למיקסר עם וו גיטרה ולשים כ-7 דקות עד לבצק דביק וחלק.', timerMinutes: 7 },
          { instruction: 'מכסים ומניחים להתפחה כשעה עד להכפלת הנפח.', timerMinutes: 60 },
          { instruction: '"מפילים" את הבצק שתפח ומניחים לו לתפוח שוב כשעה.', timerMinutes: 60, tip: 'התפחה כפולה נותנת מרקם אוורירי ועדין הרבה יותר.' },
          { instruction: 'מחממים שמן לטיגון עמוק ל-160°. ביד משומנת לוקחים פיסות בצק, יוצרים חור במרכז ומטגנים 2 דקות מכל צד עד להזהבה עדינה.', timerMinutes: 4 },
          { instruction: 'מעבירים לנייר סופג, מגלגלים מיד בסוכר ומגישים חם.' },
        ],
      },
    ],
    tips: [
      'חשוב שהשמן יהיה בטמפרטורה קבועה של 160° — גבוה מדי יישרף מבחוץ לפני שהפנים יתבשל.',
      'מגישים מיד — הספינג\' בשיאם לפני שמתקררים.',
    ],
  },

  {
    id: 'maple-cheese-cake',
    title: 'Maple White Chocolate Cheese Cake',
    titleHe: 'עוגת מייפל-גבינה-שוקולד לבן רכה',
    category: 'dessert',
    tags: ['עוגה', 'גבינה', 'מייפל', 'שוקולד לבן', 'שישייה'],
    image: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=900&q=80',
    description: 'עוגה רכה ולחה עם שישיית גבינה-שוקולד לבן על בלילת מייפל עשירה — מראה מרשים, טעם מנצח.',
    prepTime: 20,
    cookTime: 55,
    servings: 12,
    difficulty: 'medium',
    featured: true,
    ingredients: [
      {
        group: 'שישייה (שלב 1)',
        items: [
          { amount: 100, unit: 'גרם', name: 'שוקולד לבן מותך' },
          { amount: 250, unit: 'גרם', name: 'גבינה לבנה 5%' },
          { amount: 1, unit: 'כפית', name: 'משחת וניל' },
        ],
      },
      {
        group: 'נוזלים (שלב 2)',
        items: [
          { amount: 100, unit: 'גרם', name: 'שמן צמחי' },
          { amount: 50, unit: 'גרם', name: 'חמאה מותכת' },
          { amount: 200, unit: 'גרם', name: 'יוגורט טבעי' },
          { amount: 3, unit: '', name: 'ביצים L' },
          { amount: 1, unit: 'כפית', name: 'משחת וניל' },
          { amount: 220, unit: 'גרם', name: 'סוכר לבן' },
          { amount: 100, unit: 'גרם', name: 'סירופ מייפל' },
          { amount: 2, unit: 'גרם', name: 'מלח' },
        ],
      },
      {
        group: 'יבשים (שלב 3)',
        items: [
          { amount: 150, unit: 'גרם', name: 'קמח לבן' },
          { amount: 50, unit: 'גרם', name: 'סולת' },
          { amount: 10, unit: 'גרם', name: 'אבקת אפייה' },
        ],
      },
    ],
    steps: [
      {
        items: [
          { instruction: 'מחממים תנור ל-160°. משמנים ומקמחים תבנית 20×20 ס"מ.' },
          { instruction: 'שלב 1 — מערבבים מהר שוקולד לבן, גבינה ווניל. מניחים בצד.' },
          { instruction: 'שלב 2 — מניחים את כל חומרי השלב 2 במעבד מזון וטורפים היטב.' },
          { instruction: 'שלב 3 — מנפים את היבשים ומוסיפים לתערובת, מערבלים עד איחוד בלבד. לא מעבדים יתר.' },
          { instruction: 'מוסיפים 80 גרם מהבלילה לקערת הגבינה ומערבבים היטב.' },
          { instruction: 'יוצקים את בלילת העוגה לתבנית. מניחים עליה כפות מתערובת הגבינה ומשיישים בסכין.', tip: 'לשישייה יפה — פשוט גררו את הסכין בתנועות S על פני הבלילה.' },
          { instruction: 'אופים 45-60 דקות עד שקיסם יוצא עם מעט פירורים לחים.', timerMinutes: 55 },
        ],
      },
    ],
  },

  {
    id: 'tiramisu',
    title: 'Tiramisu',
    titleHe: 'טירמיסו',
    category: 'dessert',
    tags: ['איטלקי', 'קפה', 'שמנת', 'ללא אפייה'],
    cuisine: 'Italian',
    image: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=900&q=80',
    description: 'טירמיסו קלאסי עם ביסקוטי בישקוטי תוצרת בית, זביונה אמיתית וקרם מסקרפונה עדין — מושלם.',
    prepTime: 45,
    cookTime: 15,
    servings: 8,
    difficulty: 'medium',
    featured: true,
    ingredients: [
      {
        group: 'ביסקוטי',
        items: [
          { amount: 2, unit: '', name: 'ביצים' },
          { amount: 80, unit: 'גרם', name: 'סוכר' },
          { amount: 60, unit: 'גרם', name: 'קמח' },
          { amount: 20, unit: 'גרם', name: 'קורנפלור' },
          { amount: 2, unit: 'כפות', name: 'אבקת סוכר לאיבוק' },
        ],
      },
      {
        group: 'זביונה',
        items: [
          { amount: 3, unit: '', name: 'חלמונים' },
          { amount: 100, unit: 'גרם', name: 'סוכר' },
          { amount: 50, unit: 'גרם', name: 'מים' },
        ],
      },
      {
        group: 'קרם מסקרפונה',
        items: [
          { amount: 250, unit: 'גרם', name: 'שמנת מתוקה' },
          { amount: 250, unit: 'גרם', name: 'מסקרפונה' },
          { amount: 1, unit: 'כפית', name: 'משחת וניל' },
        ],
      },
      {
        group: 'סירופ',
        items: [
          { amount: 300, unit: 'גרם', name: 'אספרסו חזק וחם' },
          { amount: 50, unit: 'גרם', name: 'ברנדי' },
          { amount: 50, unit: 'גרם', name: 'אבקת סוכר' },
          { amount: 2, unit: 'כפות', name: 'אבקת קקאו לעיטור' },
        ],
      },
    ],
    steps: [
      {
        title: 'ביסקוטי',
        items: [
          { instruction: 'מקציפים ביצים וסוכר כ-5 דקות לקציפה יציבה וסמיכה.', timerMinutes: 5 },
          { instruction: 'מנפים קמח וקורנפלור מעל ומקפלים בעדינות. משטחים על מגש לעובי 5 מ"מ ומאבקים בנדיבות באבקת סוכר.' },
          { instruction: 'אופים ב-180° כ-12 דקות. מחלקים לשני חלקים התואמים את כלי ההגשה.', timerMinutes: 12 },
        ],
      },
      {
        title: 'זביונה',
        items: [
          { instruction: 'מניחים חלמונים, סוכר ומים בקערה מעל סיר מים רותחים (באן מארי) ומקציפים ללא הפסקה כ-5 דקות עד קבלת תערובת תפוחה ואוורירית. מצננים.', timerMinutes: 5 },
        ],
      },
      {
        title: 'קרם ורכבה',
        items: [
          { instruction: 'מקציפים מסקרפונה, וניל ושמנת לקרם סמיך. מקפלים בעדינות את הזביונה לתוך הקרם.' },
          { instruction: 'מערבבים אספרסו, ברנדי ואבקת סוכר לסירופ. מניחים ביסקוטי בתחתית כלי ההגשה ומספיגים במחצית הסירופ.' },
          { instruction: 'יוצקים מחצית מהקרם. מניחים ביסקוטי שני, מספיגים ביתרת הסירופ ומורחים יתרת הקרם.' },
          { instruction: 'מאבקים בנדיבות בקקאו. מכסים ומעבירים לקירור לפחות 4 שעות.', timerMinutes: 240, tip: 'טירמיסו שעמד לילה שלם במקרר טעים פי כמה.' },
        ],
      },
    ],
  },

  {
    id: 'spiced-ginger-cookies',
    title: 'Spiced Ginger Cookies',
    titleHe: "עוגיות ג'ינג'ר מתובלות",
    category: 'dessert',
    tags: ["ג'ינג'ר", 'עוגיות', 'תבלינים', 'פריך'],
    image: 'https://images.unsplash.com/photo-1481391319762-47dff72954d9?w=900&q=80',
    description: "עוגיות ג'ינג'ר פריכות בציפוי סוכר מגרגר, בעלות עומק תיבול מושלם עם אגוז מוסקט ופלפל אנגלי.",
    prepTime: 20,
    cookTime: 15,
    servings: 90,
    difficulty: 'easy',
    ingredients: [
      {
        items: [
          { amount: 175, unit: 'גרם', name: 'חמאה' },
          { amount: 175, unit: 'גרם', name: 'סוכר חום' },
          { amount: 2, unit: '', name: 'ביצים' },
          { amount: 400, unit: 'גרם', name: 'קמח' },
          { amount: 6, unit: 'גרם', name: 'אבקת אפייה' },
          { amount: 10, unit: 'גרם', name: "ג'ינג'ר יבש טחון" },
          { amount: 1, unit: 'כפית', name: 'אגוז מוסקט טחון' },
          { amount: 2, unit: 'כפיות', name: 'פלפל אנגלי טחון' },
          { amount: 1, unit: '', name: 'ביצה טרופה (לציפוי)' },
          { amount: 0.5, unit: 'כוס', name: 'סוכר (לציפוי)' },
        ],
      },
    ],
    steps: [
      {
        items: [
          { instruction: 'מקציפים חמאה עם סוכר חום. מוסיפים בהדרגה את הביצים וממשיכים להקציף לתערובת אחידה.' },
          { instruction: 'מוסיפים את יתרת המרכיבים ומגבשים לבצק חלק. מחלקים ל-4 חלקים.' },
          { instruction: 'יוצרים מכל חלק גליל ומקפיאים שעה.', timerMinutes: 60, tip: 'הגלילים יכולים להישמר במקפיא שבועות — נוח לאפות כמות קטנה לפי הצורך.' },
          { instruction: 'מברישים גלילים בביצה ומגלגלים בסוכר. פורסים לפרוסות 5 מ"מ ומניחים על תבנית.' },
          { instruction: 'אופים ב-160° כ-15 דקות.', timerMinutes: 15 },
        ],
      },
    ],
  },

  {
    id: 'date-chocolate-cookies',
    title: 'Rolled Date & Chocolate Cookies',
    titleHe: 'עוגיות מגולגלות תמרים ושוקולד',
    category: 'dessert',
    tags: ['עוגיות', 'תמרים', 'שוקולד', 'גלולות'],
    image: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=900&q=80',
    description: 'עוגיות פריכות עם מילוי שוקולד-תמרים-טחינה עשיר, חתוכות באלכסון לצורת משולש — מיוחדות ומרשימות.',
    prepTime: 40,
    cookTime: 22,
    servings: 60,
    difficulty: 'medium',
    ingredients: [
      {
        group: 'בצק',
        items: [
          { amount: 480, unit: 'גרם', name: 'קמח' },
          { amount: 5, unit: 'גרם', name: 'אבקת אפייה' },
          { amount: 50, unit: 'גרם', name: 'סוכר' },
          { amount: 1, unit: 'כפית', name: 'משחת וניל' },
          { amount: 200, unit: 'גרם', name: 'חמאה קרה, קוביות' },
          { amount: 250, unit: 'גרם', name: 'שמנת מתוקה 38%' },
        ],
      },
      {
        group: 'מילוי',
        items: [
          { amount: 180, unit: 'גרם', name: 'שוקולד לבן' },
          { amount: 100, unit: 'גרם', name: 'שוקולד מריר' },
          { amount: 50, unit: 'גרם', name: 'שמן קנולה' },
          { amount: 100, unit: 'גרם', name: 'טחינה גולמית' },
          { amount: 35, unit: 'גרם', name: 'אבקת קקאו' },
          { amount: 1, unit: 'כפית', name: 'קינמון טחון' },
          { amount: 250, unit: 'גרם', name: 'ממרח תמרים חלק' },
          { amount: 2, unit: 'כפות', name: 'אבקת סוכר לאיבוק' },
        ],
      },
    ],
    steps: [
      {
        title: 'בצק',
        items: [
          { instruction: 'מניחים חומרים יבשים במעבד מזון עם חמאה וטוחנים לפירורים עדינים. מוסיפים וניל ושמנת ומעבדים לפירורים לחים.' },
          { instruction: 'מהדקים לגליל, עוטפים וצוננים שעה לפחות.', timerMinutes: 60 },
        ],
      },
      {
        title: 'מילוי',
        items: [
          { instruction: 'מתיכים שוקולדים, שמן וטחינה גולמית. מוסיפים קקאו וקינמון. מוסיפים ממרח תמרים ומאחדים. מניחים להתייצב בטמפ\' החדר.' },
        ],
      },
      {
        title: 'הרכבה',
        items: [
          { instruction: 'מחלקים בצק ל-4 ומרדדים כל חלק למלבן 20×30 ס"מ. מורחים ¼ מהמילוי ומגלגלים לרולדה הדוקה.' },
          { instruction: 'מעבירים למגש ומניחים לקירור שעה לפחות.', timerMinutes: 30, tip: 'קירור הרולדה לפני חיתוך מונע זליגת המילוי באפייה.' },
          { instruction: 'חותכים לפרוסות אלכסוניות (משולשים) ומותירים בצורה המקורית כך שפרוסה תומכת בפרוסה.' },
          { instruction: 'אופים ב-180° כ-22 דקות. מצננים ומאבקים באבקת סוכר.', timerMinutes: 22 },
        ],
      },
    ],
  },

  {
    id: 'harira-soup',
    title: 'Harira Soup',
    titleHe: 'מרק חרירה',
    category: 'soup',
    tags: ['מרוקאי', 'חומוס', 'עדשים', 'עשבי תיבול'],
    cuisine: 'Moroccan',
    image: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=900&q=80',
    description: 'מרק חרירה מרוקאי עשיר עם חומוס, עדשים שחורות ועשבי תיבול טריים — נשמה של ארוחת ערב.',
    prepTime: 30,
    cookTime: 75,
    servings: 16,
    difficulty: 'easy',
    ingredients: [
      {
        items: [
          { amount: 2, unit: '', name: 'בצלים סגולים, פרוסים לטבעות' },
          { amount: 2, unit: 'שיני', name: 'שום כתושות' },
          { amount: 1, unit: '', name: 'כרישה, פרוסה לטבעות' },
          { amount: 1, unit: '', name: 'גזר, חצאי טבעות' },
          { amount: 1, unit: '', name: 'שורש סלרי, קוביות' },
          { amount: 1, unit: '', name: 'שורש פטרוזיליה, קוביות' },
          { amount: 2, unit: 'כפיות', name: 'כורכום' },
          { amount: 1, unit: 'כפית', name: 'פלפל שחור' },
          { amount: 1, unit: 'כפית', name: 'קינמון' },
          { amount: 2, unit: 'כפיות', name: "חוואיג' למרק" },
          { amount: 3, unit: '', name: 'עגבניות טריות, קוביות' },
          { amount: 200, unit: 'גרם', name: 'גרגרי חומוס, מושרים 12 שעות ומבושלים' },
          { amount: 150, unit: 'גרם', name: 'עדשים שחורות, מושרות 20 דקות' },
          { amount: 3, unit: 'ליטר', name: 'מים' },
          { amount: 2, unit: '', name: 'תפוחי אדמה, קוביות' },
          { amount: 30, unit: 'גרם', name: 'קמח' },
          { amount: 100, unit: 'גרם', name: 'אטריות דקות' },
          { amount: 1, unit: 'צרור', name: 'פטרוזיליה, קצוצה' },
          { amount: 1, unit: 'צרור', name: 'כוסברה, קצוצה' },
          { amount: 2, unit: 'כפיות', name: 'מלח' },
          { amount: 3, unit: '', name: 'לימונים, סחוטים' },
        ],
      },
    ],
    steps: [
      {
        items: [
          { instruction: 'בסיר גדול מחממים שמן ומטגנים בצל, שום, כרישה ושורשים עד להזהבה.' },
          { instruction: 'מוסיפים תבלינים, מערבבים ומטגנים 3 דקות. מוסיפים עגבניות ומבשלים 2 דקות.' },
          { instruction: 'מוסיפים חומוס, עדשים, מים ותפוח אדמה — מביאים לרתיחה. מבשלים על להבה נמוכה כ-30 דקות.', timerMinutes: 30 },
          { instruction: 'מדללים קמח בכוס מים ובוחשים לתוך המרק. מבשלים 10 דקות ומערבבים מדי פעם.', timerMinutes: 10, tip: 'הסמכה עם קמח נמצ היא הסוד לגוף המרק המאפיין את החרירה.' },
          { instruction: 'מוסיפים עשבי תיבול, אטריות ומלח — מבשלים 10 דקות.', timerMinutes: 10 },
          { instruction: 'מוסיפים מיץ לימון ומבשלים 5 דקות. טועמים ומתקנים תיבול.', timerMinutes: 5 },
        ],
      },
    ],
    tips: [
      'ניתן להוסיף נתחי פרגית לגרסה עם בשר.',
      'מתאחר בזמן — המרק רק מתעצם בטעמו ביום שאחרי.',
    ],
  },

  {
    id: 'pumpkin-coconut-soup',
    title: 'Pumpkin Coconut Soup with Falafel',
    titleHe: 'מרק קרם דלעת וקוקוס עם פלאפל בריאות',
    category: 'soup',
    tags: ['דלעת', 'קוקוס', 'פלאפל', 'טבעוני'],
    image: 'https://images.unsplash.com/photo-1476718406336-bb5a9690ee2a?w=900&q=80',
    description: 'מרק דלעת קטיפתי עם חלב קוקוס וכדורי פלאפל בריא של קטניות מעורבות — קינוח כלי או ארוחה שלמה.',
    prepTime: 30,
    cookTime: 35,
    servings: 8,
    difficulty: 'easy',
    ingredients: [
      {
        group: 'מרק',
        items: [
          { amount: 2, unit: '', name: 'בצלים, חתוכים גס' },
          { amount: 3, unit: 'שיני', name: 'שום קלופות' },
          { amount: 2, unit: 'כפות', name: "ג'ינג'ר כבוש" },
          { amount: 2, unit: 'ק"ג', name: 'דלעת קלופה, קוביות גסות' },
          { amount: 1.5, unit: 'ליטר', name: 'מים או ציר ירקות' },
          { amount: 400, unit: 'מ"ל', name: 'חלב קוקוס' },
          { amount: 1, unit: 'כפית', name: 'מלח ים' },
        ],
      },
      {
        group: 'פלאפל',
        items: [
          { amount: 2, unit: 'כוסות', name: 'קטניות מעורבות (חומוס, שעועית שחורה, עדשים) — מושרות לילה' },
          { amount: 1, unit: 'צרור', name: 'כוסברה טרייה' },
          { amount: 1, unit: 'צרור', name: 'שמיר טרי' },
          { amount: 1, unit: 'כפית', name: 'כוסברה יבשה' },
          { amount: 1, unit: 'כפית', name: 'כמון' },
          { amount: 2, unit: 'שיני', name: 'שום' },
          { amount: 5, unit: 'גרם', name: 'אבקת אפייה' },
          { amount: 1, unit: 'ליטר', name: 'שמן לטיגון עמוק' },
        ],
      },
    ],
    steps: [
      {
        title: 'מרק',
        items: [
          { instruction: 'מכניסים דלעת, בצלים, שום, ג\'ינג\'ר ומים לסיר — מביאים לרתיחה. מנמיכים ומבשלים עד שהדלעת רכה.', timerMinutes: 25 },
          { instruction: 'מרסקים לחלק. מחזירים לסיר עם חלב קוקוס, מביאים לרתיחה ומתבלים. מבשלים עוד 10 דקות.', timerMinutes: 10 },
        ],
      },
      {
        title: 'פלאפל',
        items: [
          { instruction: 'מסננים קטניות ומרסקים במעבד מזון עם שאר החומרים לעיסה. מאחסנים שעה בקירור.', timerMinutes: 60 },
          { instruction: 'מחממים שמן לטיגון. מעצבים כדורים ומטגנים עד הזהבה.', timerMinutes: 5, tip: 'כדורים רטובים שידיים — הפלאפל לא יתפרק.' },
          { instruction: 'מוזגים מרק לצלחות ומניחים כדור פלאפל במרכז.' },
        ],
      },
    ],
  },

  {
    id: 'vegetable-fritters',
    title: 'Root Vegetable Fritters',
    titleHe: 'לביבות ירקות',
    category: 'snack',
    tags: ['ירקות', 'טבעוני', 'מהיר', 'מנה ראשונה'],
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=900&q=80',
    description: 'לביבות ירקות שורש קטיפתיות — בטטה, סלרי, לפת ותפוח אדמה — מטוגנות בשמן זית עד להזהבה עדינה.',
    prepTime: 20,
    cookTime: 20,
    servings: 12,
    difficulty: 'easy',
    ingredients: [
      {
        items: [
          { amount: 2, unit: '', name: 'בטטות, קלופות וחתוכות לקוביות' },
          { amount: 2, unit: '', name: 'שורשי סלרי, קלופים וחתוכים לקוביות' },
          { amount: 1, unit: '', name: 'כרישה, שטופה וחתוכה לטבעות' },
          { amount: 1, unit: '', name: 'לפת, קלופה וחתוכה לקוביות' },
          { amount: 1, unit: 'גדול', name: 'תפוח אדמה, קלוף וחתוך לקוביות' },
          { amount: 1, unit: 'ליטר', name: 'חלב' },
          { amount: 0.75, unit: 'כוס', name: 'קמח תופח' },
          { amount: 3, unit: '', name: 'ביצים' },
          { amount: 2, unit: 'כפות', name: "רוטב צ'ילי מתוק" },
          { amount: 1, unit: 'כפית', name: 'מלח' },
          { amount: 0.5, unit: 'כפית', name: 'פלפל שחור גרוס' },
          { amount: 3, unit: 'כפות', name: 'שמן זית לטיגון' },
        ],
      },
    ],
    steps: [
      {
        items: [
          { instruction: 'מבשלים ירקות שורש בחלב עד ריכוך. מצננים, מסננים ומועכים למחית.', timerMinutes: 20 },
          { instruction: 'מערבבים מחית ירקות עם קמח, ביצים, רוטב צ\'ילי, מלח ופלפל. משהים 10 דקות.', timerMinutes: 10 },
          { instruction: 'מחממים שמן זית בגובה ½ ס"מ במחבת. יוצקים לביבות ומטגנים כ-1 דקה מכל צד עד הזהבה.', timerMinutes: 2, tip: 'העבירו את הבלילה לבקבוק פלסטי לחיץ — כך קל יותר ליצוק לביבות בצורה אחידה.' },
          { instruction: 'מגישים חם עם שמנת חמוצה או יוגורט.' },
        ],
      },
    ],
  },

  {
    id: 'honey-cherry-challah',
    title: 'Honey & Cherry Challah',
    titleHe: 'חלת דבש וצימוקי דובדבנים',
    category: 'bread',
    tags: ['חלה', 'שבת', 'דבש', 'דובדבנים'],
    cuisine: 'Jewish',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=900&q=80',
    description: 'חלה שבת חגיגית עם דבש וצימוקי דובדבנים מתוקים — קלועה, מבריקה ועשירה.',
    prepTime: 40,
    cookTime: 25,
    servings: 16,
    difficulty: 'medium',
    featured: true,
    ingredients: [
      {
        items: [
          { amount: 1, unit: 'ק"ג', name: 'קמח לחם קשה' },
          { amount: 40, unit: 'גרם', name: 'שמרים יבשים' },
          { amount: 60, unit: 'גרם', name: 'סוכר' },
          { amount: 50, unit: 'גרם', name: 'דבש' },
          { amount: 20, unit: 'גרם', name: 'מלח' },
          { amount: 100, unit: 'גרם', name: 'שמן קנולה' },
          { amount: 200, unit: 'גרם', name: 'ביצים (~4 ביצים)' },
          { amount: 350, unit: 'גרם', name: 'מים' },
          { amount: 150, unit: 'גרם', name: 'צימוקי דובדבנים, קצוצים' },
          { amount: 1, unit: '', name: 'ביצה טרופה להברשה' },
        ],
      },
    ],
    steps: [
      {
        items: [
          { instruction: 'מניחים חומרים יבשים בקערת מיקסר ומערבבים. מוסיפים נוזלים ולשים 10 דקות עד לבצק חלק. מוסיפים צימוקים.', timerMinutes: 10 },
          { instruction: 'מניחים בכלי מכוסה להתפחה עד הכפלת הנפח (~60 דקות).', timerMinutes: 60 },
          { instruction: 'מחלקים לחצי. מחלקים כל חצי ל-4 חלקים שווים, מרדדים לגלילים וקולעים לצמה עגולה. מניחים על תבנית.' },
          { instruction: 'מכסים ומתפיחים עד הכפלת הנפח (~45 דקות). מברישים בביצה טרופה.', timerMinutes: 45, tip: 'ברישה כפולה בביצה תיתן ברק וצבע עמוק יותר.' },
          { instruction: 'אופים ב-170° כ-25 דקות עד להזהבה יפה. מצננים היטב לפני הפריסה.', timerMinutes: 25 },
        ],
      },
    ],
    tips: [
      'צימוקי הדובדבן הופכים לגומי אם הם בצמה ולא נחתכים — קיצוץ עדין מפזר אותם טוב יותר.',
      'שמרו חלה שנותרה בכלי אטום — מחמיצה מהר בגלל הדבש.',
    ],
  },

  {
    id: 'berry-cupcakes',
    title: 'Forest Berry Cupcakes',
    titleHe: 'קאפקייק פירות יער',
    category: 'dessert',
    tags: ['קאפקייק', 'פירות יער', 'שמרים', 'ציפוי'],
    image: 'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=900&q=80',
    description: 'קאפקייק שמרים-פרי קטיפתי עם בסיס פירות יער מקורמל ועוגת שמרים אוורירית — יפה ומרשים.',
    prepTime: 40,
    cookTime: 20,
    servings: 6,
    difficulty: 'medium',
    ingredients: [
      {
        group: 'בסיס פרי',
        items: [
          { amount: 40, unit: 'גרם', name: 'תמרים שלמים, מגולענים/דבלים' },
          { amount: 0.5, unit: '', name: 'תפוח מזן גרני סמית, מגורר' },
          { amount: 30, unit: 'גרם', name: 'מחית תות/פטל' },
          { amount: 30, unit: 'גרם', name: 'מחית קסיס' },
          { amount: 25, unit: 'גרם', name: 'סוכר' },
        ],
      },
      {
        group: 'עוגת שמרים',
        items: [
          { amount: 40, unit: 'גרם', name: 'חמאה רכה' },
          { amount: 40, unit: 'גרם', name: 'סוכר חום כהה' },
          { amount: 100, unit: 'גרם', name: 'בסיס פרי (לעיל)' },
          { amount: 30, unit: 'גרם', name: 'ביצים' },
          { amount: 37, unit: 'גרם', name: 'קמח נטול גלוטן' },
          { amount: 10, unit: 'גרם', name: 'קמח אורז' },
          { amount: 10, unit: 'גרם', name: 'עמילן טפיוקה' },
          { amount: 2, unit: 'גרם', name: 'אבקת אפייה' },
          { amount: 1, unit: 'גרם', name: 'אבקת סודה לשתייה' },
          { amount: 20, unit: 'גרם', name: 'חמוציות קצוצות' },
        ],
      },
    ],
    steps: [
      {
        title: 'בסיס פרי',
        items: [
          { instruction: 'קוצצים תמרים ומבאים עם כל חומרי הבסיס לסיר, מביאים לרתיחה ומבשלים 15 דקות על להבה נמוכה, בסיר ללא כיסוי. מצננים.', timerMinutes: 15 },
        ],
      },
      {
        title: 'עוגת שמרים',
        items: [
          { instruction: 'במיקסר טורפים חמאה, סוכר, בסיס פרי וביצים. מוסיפים חומרים יבשים ומאחדים. מוסיפים חמוציות.' },
          { instruction: 'מחממים תנור ל-160-170°. מחלקים לתבניות קאפקייק ואופים כ-20 דקות עד שקיסם יוצא נקי.', timerMinutes: 20, tip: 'הוציאו מהתנור כשהקאפקייק עדיין מעט נע במרכז — ימשיך להתבשל בתבנית.' },
          { instruction: 'מצננים לפחות 20 דקות לפני הוצאה מהתבנית.', timerMinutes: 20 },
        ],
      },
    ],
  },

  {
    id: 'gf-chocolate-praline-cookies',
    title: 'Gluten-Free Chocolate Praline Cookies',
    titleHe: 'עוגיות שוקולד-פרלינה ללא גלוטן',
    category: 'dessert',
    tags: ['ללא גלוטן', 'שוקולד', 'פרלינה', 'עוגיות'],
    image: 'https://images.unsplash.com/photo-1590080876161-8e0b94cece0a?w=900&q=80',
    description: 'עוגיות שוקולד ללא גלוטן עם אגוזי לוז, שוקולד חלב ושוקולד מריר — פריכות בחוץ ורכות בפנים.',
    prepTime: 20,
    cookTime: 10,
    servings: 20,
    difficulty: 'easy',
    ingredients: [
      {
        items: [
          { amount: 80, unit: 'גרם', name: 'חמאה רכה' },
          { amount: 20, unit: 'גרם', name: 'סוכר לבן' },
          { amount: 40, unit: 'גרם', name: 'סוכר חום' },
          { amount: 60, unit: 'גרם', name: 'פרלינה לוז' },
          { amount: 30, unit: 'גרם', name: 'ביצה' },
          { amount: 50, unit: 'גרם', name: 'קמח נטול גלוטן' },
          { amount: 35, unit: 'גרם', name: 'קמח אורז' },
          { amount: 1, unit: 'גרם', name: 'אבקת סודה לשתייה' },
          { amount: 30, unit: 'גרם', name: 'שוקולד מריר, קצוץ' },
          { amount: 30, unit: 'גרם', name: 'שוקולד חלב, קצוץ' },
          { amount: 20, unit: 'גרם', name: 'אגוזי לוז, קלויים וקצוצים' },
          { amount: 1, unit: '', name: 'פרלינה לוז לזילוף' },
        ],
      },
    ],
    steps: [
      {
        items: [
          { instruction: 'מנפים את החומרים היבשים ומניחים בצד.' },
          { instruction: 'במיקסר טורפים חמאה, פרלינה וסוכרים. מוסיפים ביצה ומניחים חומרים יבשים לחיבור. לבסוף מוסיפים שוקולדים ואגוזים.' },
          { instruction: 'מעבירים לזינון לחצי שעה לפחות.', timerMinutes: 30 },
          { instruction: 'יוצרים כדורים של 20 גרם ומניחים על תבנית. אופים ב-200° כ-10 דקות.', timerMinutes: 10, tip: 'הוציאו כשהמרכז עדיין קצת נע — הם מתייצבים בצינון.' },
          { instruction: 'מצננים ומזלפים פרלינה מעל.' },
        ],
      },
    ],
    tips: [
      'ניתן להחליף קמח נטול גלוטן בקמח שקדים לגרסה עוד יותר עשירה.',
    ],
  },

  {
    id: 'gf-apple-almond-tart',
    title: 'Gluten-Free Apple & Almond Tart',
    titleHe: 'טארט תפוחים וקרם שקדים ללא גלוטן',
    category: 'dessert',
    tags: ['ללא גלוטן', 'טארט', 'תפוחים', 'שקדים'],
    image: 'https://images.unsplash.com/photo-1464305795204-6f5bbfc7fb81?w=900&q=80',
    description: 'טארט תפוחים עדין עם בצק קורנפלור פריך וקרם שקדים עשיר — ללא גלוטן, מלא טעם.',
    prepTime: 35,
    cookTime: 40,
    servings: 12,
    difficulty: 'medium',
    ingredients: [
      {
        group: 'בצק',
        items: [
          { amount: 150, unit: 'גרם', name: 'קורנפלור' },
          { amount: 30, unit: 'גרם', name: 'עמילן טפיוקה' },
          { amount: 30, unit: 'גרם', name: 'אבקת שקדים' },
          { amount: 50, unit: 'גרם', name: 'קמח אורז' },
          { amount: 130, unit: 'גרם', name: 'חמאה קרה, חתוכה לקוביות' },
          { amount: 75, unit: 'גרם', name: 'אבקת סוכר' },
          { amount: 1, unit: 'כפית', name: 'משחת וניל' },
          { amount: 1, unit: '', name: 'ביצה' },
        ],
      },
      {
        group: 'קרם שקדים',
        items: [
          { amount: 100, unit: 'גרם', name: 'אבקת סוכר' },
          { amount: 100, unit: 'גרם', name: 'אבקת שקדים' },
          { amount: 50, unit: 'גרם', name: 'קורנפלור' },
          { amount: 1, unit: '', name: 'ביצה' },
          { amount: 100, unit: 'גרם', name: 'חמאה רכה' },
          { amount: 1, unit: 'כף', name: 'רום כהה' },
        ],
      },
      {
        group: 'עיטור',
        items: [
          { amount: 4, unit: '', name: 'תפוחי עץ, קלופים ופרוסים לפרוסות דקות' },
          { amount: 2, unit: 'כפות', name: 'סוכר' },
        ],
      },
    ],
    steps: [
      {
        title: 'בצק',
        items: [
          { instruction: 'במעבד מזון טוחנים חומרים יבשים עם חמאה קרה לפירורים דקים. מוסיפים וניל וביצה ומעבדים לפירורים לחים. מאחדים ומשטחים.' },
          { instruction: 'מניחים עטוף בקירור לחצי שעה.', timerMinutes: 30 },
          { instruction: 'מרדדים לעלה 3 מ"מ ומרפדים תבנית טארט. אופים אפייה עיוורת (עם משקולת) ב-160° עד להזהבה מלאה.', timerMinutes: 20, tip: 'בצק ללא גלוטן עדין יותר — הדקו אותו בזהירות לתבנית ואל תמשכו.' },
        ],
      },
      {
        title: 'קרם שקדים ורכבה',
        items: [
          { instruction: 'טוחנים חומרים יבשים ואבקת שקדים במעבד. מוסיפים חמאה ומאחדים. מוסיפים ביצה ורום לתערובת אחידה.' },
          { instruction: 'מורחים קרם שקדים על בסיס הטארט. מסדרים פרוסות תפוח מעל ומפזרים סוכר.' },
          { instruction: 'אופים ב-160° כ-40 דקות עד להזהבה ובעבוע הקרם.', timerMinutes: 40 },
          { instruction: 'מצננים לחלוטין לפני הגשה — הקרם מתייצב בצינון.', timerMinutes: 60 },
        ],
      },
    ],
    tips: [
      'ניתן לצפות בג\'לה תפוחים לקבלת ברק יפה.',
      'הטארט נשמר עד 3 ימים בקירור.',
    ],
  },
]

export const categoryLabels: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  dessert: 'Dessert',
  salad: 'Salad',
  soup: 'Soup',
  snack: 'Snack',
  bread: 'Bread',
  sauce: 'Sauce',
}

export const categoryEmoji: Record<string, string> = {
  breakfast: '🍳',
  lunch: '🥗',
  dinner: '🍽',
  dessert: '🍰',
  salad: '🥬',
  soup: '🍲',
  snack: '🥐',
  bread: '🍞',
  sauce: '🫙',
}

export function getRecipe(id: string): Recipe | undefined {
  return recipes.find(r => r.id === id)
}

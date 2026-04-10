import type { Recipe } from '../types'

// Tugy's recipes.

export const recipes: Recipe[] = [
  {
    id: 'shakshuka',
    title: 'Classic Shakshuka',
    titleHe: 'שקשוקה קלאסית',
    category: 'breakfast',
    tags: ['eggs', 'spicy', 'one-pan', 'vegetarian'],
    cuisine: 'Israeli',
    image: 'https://images.unsplash.com/photo-1590419690008-905895e8fe0d?w=900&q=80',
    description: 'Eggs poached in a rich, spiced tomato and pepper sauce. The ultimate Israeli breakfast — bold, smoky, and impossibly satisfying.',
    prepTime: 10,
    cookTime: 25,
    servings: 4,
    difficulty: 'easy',
    featured: true,
    source: 'Tugy',
    tips: [
      'Use a wide, heavy pan so the sauce spreads evenly and the eggs cook without touching.',
      'Crack eggs into a small bowl first to avoid breaking the yolk into the sauce.',
      'Cover the pan with a lid for the last 3-4 minutes for perfectly set whites with runny yolks.',
    ],
    ingredients: [
      {
        group: 'Sauce',
        items: [
          { amount: 3, unit: 'tbsp', name: 'olive oil' },
          { amount: 1, unit: '', name: 'large onion', note: 'diced' },
          { amount: 1, unit: '', name: 'red bell pepper', note: 'diced' },
          { amount: 1, unit: '', name: 'yellow bell pepper', note: 'diced' },
          { amount: 5, unit: 'cloves', name: 'garlic', note: 'sliced' },
          { amount: 1, unit: 'tsp', name: 'cumin' },
          { amount: 1, unit: 'tsp', name: 'sweet paprika' },
          { amount: 0.5, unit: 'tsp', name: 'smoked paprika' },
          { amount: 0.25, unit: 'tsp', name: 'cayenne pepper', note: 'or to taste' },
          { amount: 800, unit: 'g', name: 'crushed tomatoes', note: '2 cans' },
          { amount: 1, unit: 'tsp', name: 'sugar' },
          { amount: 1, unit: 'tsp', name: 'salt' },
        ],
      },
      {
        group: 'To finish',
        items: [
          { amount: 6, unit: '', name: 'eggs' },
          { amount: 100, unit: 'g', name: 'feta cheese', note: 'crumbled' },
          { amount: 1, unit: 'handful', name: 'fresh parsley', note: 'chopped' },
          { amount: 1, unit: 'handful', name: 'fresh cilantro', note: 'chopped' },
        ],
      },
    ],
    steps: [
      {
        title: 'Build the sauce',
        items: [
          { instruction: 'Heat olive oil in a large, wide skillet over medium heat. Add onion and peppers and cook, stirring occasionally, until softened — about 8 minutes.', timerMinutes: 8 },
          { instruction: 'Add garlic, cumin, both paprikas, and cayenne. Stir for 1 minute until fragrant.', timerMinutes: 1 },
          { instruction: 'Pour in crushed tomatoes. Add sugar and salt. Stir to combine and simmer uncovered for 12 minutes until sauce thickens slightly.', timerMinutes: 12, tip: 'The sauce should be thick enough that a spoon drawn across leaves a trail.' },
        ],
      },
      {
        title: 'Add the eggs',
        items: [
          { instruction: 'Use a spoon to make 6 wells in the sauce. Crack one egg into each well. Season eggs with a pinch of salt.' },
          { instruction: 'Cover the pan and cook until whites are just set but yolks are still runny — about 5-6 minutes. Watch closely.', timerMinutes: 6, tip: 'For fully set yolks, cook 2 minutes longer.' },
          { instruction: 'Remove from heat. Scatter feta, parsley, and cilantro over the top. Serve immediately from the pan with crusty bread.' },
        ],
      },
    ],
  },

  {
    id: 'hummus-masabacha',
    title: 'Hummus Masabacha',
    titleHe: 'מסבחה',
    category: 'snack',
    tags: ['dip', 'chickpeas', 'vegetarian', 'vegan', 'spread'],
    cuisine: 'Israeli',
    image: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=900&q=80',
    description: 'Warm whole chickpeas in silky tahini sauce — the more rustic, soulful cousin of hummus. Served hot with olive oil and a squeeze of lemon.',
    prepTime: 20,
    cookTime: 10,
    servings: 6,
    difficulty: 'easy',
    featured: true,
    source: 'Tugy',
    tips: [
      'Use dried chickpeas cooked from scratch — the difference in texture is significant.',
      'Keep some of the chickpea cooking water to loosen the tahini to the right consistency.',
    ],
    ingredients: [
      {
        group: 'Base',
        items: [
          { amount: 500, unit: 'g', name: 'cooked chickpeas', note: 'from 250g dried, or 2 cans drained' },
          { amount: 200, unit: 'g', name: 'good quality tahini' },
          { amount: 2, unit: '', name: 'lemons', note: 'juiced' },
          { amount: 2, unit: 'cloves', name: 'garlic', note: 'crushed' },
          { amount: 0.5, unit: 'tsp', name: 'salt' },
          { amount: 0.5, unit: 'cup', name: 'cold water' },
        ],
      },
      {
        group: 'Topping',
        items: [
          { amount: 4, unit: 'tbsp', name: 'olive oil', note: 'extra virgin' },
          { amount: 1, unit: 'tsp', name: 'cumin' },
          { amount: 1, unit: 'tsp', name: 'paprika' },
          { amount: 1, unit: 'handful', name: 'parsley', note: 'chopped' },
        ],
      },
    ],
    steps: [
      {
        items: [
          { instruction: 'Whisk tahini with lemon juice and garlic until it seizes into a thick paste. Gradually add cold water, whisking constantly, until you have a smooth, ivory sauce. Season with salt.', tip: 'The tahini will thicken dramatically before it loosens — keep whisking.' },
          { instruction: 'Warm the chickpeas in a small saucepan with a splash of their cooking water. Season lightly with salt and cumin.' },
          { instruction: 'Spoon tahini sauce into shallow bowls. Pile warm chickpeas on top. Drizzle generously with olive oil, dust with paprika and cumin, scatter parsley. Serve immediately with fresh pita.' },
        ],
      },
    ],
  },

  {
    id: 'roast-chicken-herbs',
    title: 'Za\'atar Roast Chicken',
    titleHe: 'עוף צלוי בזעתר',
    category: 'dinner',
    tags: ['chicken', 'roast', 'za\'atar', 'main', 'sabbath'],
    cuisine: 'Israeli',
    image: 'https://images.unsplash.com/photo-1598103442097-8b74394b95c3?w=900&q=80',
    description: 'A whole chicken rubbed with za\'atar, sumac, and lemon, roasted until the skin shatters and the meat is fall-off-the-bone tender.',
    prepTime: 20,
    cookTime: 90,
    servings: 4,
    difficulty: 'medium',
    featured: true,
    source: 'Tugy',
    tips: [
      'Dry-brine the chicken uncovered in the fridge for at least 2 hours (ideally overnight) for crispier skin.',
      'Rest the chicken for 15 minutes before carving — this is non-negotiable.',
    ],
    ingredients: [
      {
        group: 'Chicken',
        items: [
          { amount: 1, unit: '', name: 'whole chicken', note: '~1.8kg' },
          { amount: 3, unit: 'tbsp', name: 'za\'atar' },
          { amount: 1, unit: 'tbsp', name: 'sumac' },
          { amount: 1, unit: 'tsp', name: 'sweet paprika' },
          { amount: 4, unit: 'tbsp', name: 'olive oil' },
          { amount: 1, unit: '', name: 'lemon', note: 'zested and halved' },
          { amount: 1, unit: 'tsp', name: 'salt' },
          { amount: 0.5, unit: 'tsp', name: 'black pepper' },
        ],
      },
      {
        group: 'Roasting base',
        items: [
          { amount: 1, unit: '', name: 'whole head garlic', note: 'halved crosswise' },
          { amount: 2, unit: '', name: 'onions', note: 'quartered' },
          { amount: 4, unit: '', name: 'carrots', note: 'halved' },
          { amount: 100, unit: 'ml', name: 'dry white wine or chicken stock' },
        ],
      },
    ],
    steps: [
      {
        title: 'Prepare and marinate',
        items: [
          { instruction: 'Preheat oven to 220°C (430°F). Mix za\'atar, sumac, paprika, olive oil, lemon zest, salt and pepper into a paste.' },
          { instruction: 'Pat chicken dry with paper towels. Rub the spice paste all over the chicken, under the skin of the breast, and inside the cavity.' },
          { instruction: 'Stuff the cavity with the squeezed lemon halves and a few garlic cloves.' },
        ],
      },
      {
        title: 'Roast',
        items: [
          { instruction: 'Scatter onions, carrots, and remaining garlic in a roasting pan. Pour in wine. Sit the chicken on top, breast side up.' },
          { instruction: 'Roast at 220°C for 20 minutes until skin starts to colour. Reduce to 190°C and roast for a further 50-60 minutes, basting with pan juices halfway through.', timerMinutes: 70, tip: 'Chicken is done when juices run clear when you pierce the thickest part of the thigh.' },
          { instruction: 'Remove from oven. Tent loosely with foil and rest for 15 minutes before carving.', timerMinutes: 15 },
        ],
      },
    ],
  },

  {
    id: 'fattoush',
    title: 'Fattoush Salad',
    titleHe: 'פטוש',
    category: 'salad',
    tags: ['salad', 'vegetarian', 'fresh', 'bread', 'summer'],
    cuisine: 'Levantine',
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=900&q=80',
    description: 'Crispy fried pita shards tossed with seasonal vegetables, tangy sumac dressing, and fresh herbs. A salad that genuinely earns its place on the table.',
    prepTime: 20,
    cookTime: 8,
    servings: 4,
    difficulty: 'easy',
    source: 'Tugy',
    ingredients: [
      {
        group: 'Crispy pita',
        items: [
          { amount: 2, unit: '', name: 'pita breads', note: 'torn into rough pieces' },
          { amount: 3, unit: 'tbsp', name: 'olive oil' },
          { amount: 0.5, unit: 'tsp', name: 'sumac' },
          { amount: 0.25, unit: 'tsp', name: 'salt' },
        ],
      },
      {
        group: 'Salad',
        items: [
          { amount: 4, unit: '', name: 'ripe tomatoes', note: 'cut into wedges' },
          { amount: 2, unit: '', name: 'Persian cucumbers', note: 'sliced' },
          { amount: 1, unit: '', name: 'red onion', note: 'thinly sliced' },
          { amount: 1, unit: '', name: 'green bell pepper', note: 'diced' },
          { amount: 1, unit: 'bunch', name: 'radishes', note: 'sliced' },
          { amount: 1, unit: 'large bunch', name: 'parsley', note: 'roughly chopped' },
          { amount: 1, unit: 'small bunch', name: 'mint', note: 'leaves picked' },
          { amount: 4, unit: '', name: 'spring onions', note: 'sliced' },
        ],
      },
      {
        group: 'Dressing',
        items: [
          { amount: 4, unit: 'tbsp', name: 'olive oil' },
          { amount: 2, unit: 'tbsp', name: 'lemon juice' },
          { amount: 1, unit: 'tbsp', name: 'sumac' },
          { amount: 1, unit: 'tsp', name: 'pomegranate molasses' },
          { amount: 0.5, unit: 'tsp', name: 'salt' },
        ],
      },
    ],
    steps: [
      {
        items: [
          { instruction: 'Toss pita pieces with olive oil, sumac, and salt. Spread on a baking sheet and bake at 200°C for 8-10 minutes until golden and very crispy.', timerMinutes: 10, tip: 'They should be crunchy — they\'ll soften slightly once dressed.' },
          { instruction: 'Whisk together all dressing ingredients in a small bowl.' },
          { instruction: 'Combine all salad vegetables and herbs in a large bowl. Add crispy pita. Pour dressing over and toss to coat. Serve immediately while pita is still crunchy.' },
        ],
      },
    ],
  },

  {
    id: 'knafeh',
    title: 'Knafeh',
    titleHe: 'כנאפה',
    category: 'dessert',
    tags: ['dessert', 'cheese', 'sweet', 'baked', 'Palestinian', 'Middle Eastern'],
    cuisine: 'Palestinian / Levantine',
    image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=900&q=80',
    description: 'The queen of Levantine sweets — shredded filo dough layered with warm, stretchy cheese, soaked in rose-scented sugar syrup, and crowned with crushed pistachios.',
    prepTime: 30,
    cookTime: 35,
    servings: 12,
    difficulty: 'medium',
    featured: true,
    source: 'Tugy',
    tips: [
      'Use mozzarella mixed with akkawi (or ricotta) for the best melt and stretch.',
      'The syrup must be cold when you pour it onto the hot knafeh — this is key to the texture.',
      'Work fast when flipping — have your serving plate ready.',
    ],
    ingredients: [
      {
        group: 'Sugar syrup',
        items: [
          { amount: 2, unit: 'cups', name: 'sugar' },
          { amount: 1, unit: 'cup', name: 'water' },
          { amount: 1, unit: 'tbsp', name: 'rose water' },
          { amount: 1, unit: 'tsp', name: 'lemon juice' },
        ],
      },
      {
        group: 'Knafeh',
        items: [
          { amount: 500, unit: 'g', name: 'kataifi (shredded filo) dough', note: 'thawed' },
          { amount: 150, unit: 'g', name: 'unsalted butter', note: 'melted' },
          { amount: 2, unit: 'tbsp', name: 'orange food colouring', note: 'optional' },
          { amount: 300, unit: 'g', name: 'fresh mozzarella', note: 'shredded' },
          { amount: 200, unit: 'g', name: 'akkawi or ricotta cheese' },
          { amount: 100, unit: 'g', name: 'pistachios', note: 'finely chopped, for garnish' },
        ],
      },
    ],
    steps: [
      {
        title: 'Make the syrup (do this first)',
        items: [
          { instruction: 'Combine sugar and water in a saucepan over medium heat. Stir until dissolved, then boil without stirring for 10 minutes until slightly thickened. Add lemon juice and rose water. Set aside to cool completely.', timerMinutes: 10 },
        ],
      },
      {
        title: 'Assemble and bake',
        items: [
          { instruction: 'Preheat oven to 180°C. Pull kataifi dough apart with your hands to separate the strands. Toss with melted butter and orange food colouring if using.' },
          { instruction: 'Press half the kataifi into a buttered 30cm round oven-proof pan or skillet, packing tightly to form an even base.' },
          { instruction: 'Mix mozzarella and akkawi/ricotta together. Spread evenly over the kataifi base, leaving a 1cm border.' },
          { instruction: 'Top with remaining kataifi, pressing down firmly to compress everything. Bake for 30-35 minutes until deep golden.', timerMinutes: 35, tip: 'You can also cook the bottom on the stovetop for 10 minutes first for extra crunch.' },
          { instruction: 'Working quickly, place a large serving plate over the pan and flip in one confident motion. Immediately pour cold syrup evenly over the hot knafeh. Garnish with pistachios. Serve at once.' },
        ],
      },
    ],
  },

  {
    id: 'lentil-soup',
    title: 'Red Lentil Soup',
    titleHe: 'מרק עדשים אדומות',
    category: 'soup',
    tags: ['soup', 'lentils', 'vegan', 'winter', 'comfort', 'quick'],
    cuisine: 'Israeli',
    image: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=900&q=80',
    description: 'A deeply warming, golden soup of red lentils with cumin, turmeric, and a sizzling lemon butter finish. Ready in under an hour, impossible to stop eating.',
    prepTime: 15,
    cookTime: 40,
    servings: 6,
    difficulty: 'easy',
    source: 'Tugy',
    ingredients: [
      {
        group: 'Soup',
        items: [
          { amount: 3, unit: 'tbsp', name: 'olive oil' },
          { amount: 2, unit: '', name: 'onions', note: 'diced' },
          { amount: 4, unit: 'cloves', name: 'garlic', note: 'minced' },
          { amount: 2, unit: 'tsp', name: 'cumin' },
          { amount: 1, unit: 'tsp', name: 'turmeric' },
          { amount: 0.5, unit: 'tsp', name: 'coriander' },
          { amount: 400, unit: 'g', name: 'red lentils', note: 'rinsed' },
          { amount: 1.5, unit: 'litres', name: 'vegetable or chicken stock' },
          { amount: 2, unit: '', name: 'carrots', note: 'diced' },
          { amount: 1, unit: 'tsp', name: 'salt' },
        ],
      },
      {
        group: 'Lemon butter finish',
        items: [
          { amount: 50, unit: 'g', name: 'butter' },
          { amount: 1.5, unit: 'tsp', name: 'cumin seeds' },
          { amount: 1, unit: '', name: 'lemon', note: 'juiced' },
          { amount: 0.5, unit: 'tsp', name: 'chilli flakes' },
        ],
      },
    ],
    steps: [
      {
        items: [
          { instruction: 'Heat olive oil in a large pot. Sauté onions until golden, about 8 minutes. Add garlic and dry spices, cook 1 minute.', timerMinutes: 9 },
          { instruction: 'Add lentils, carrots, and stock. Bring to a boil, then simmer uncovered for 25-30 minutes until lentils are completely soft and falling apart.', timerMinutes: 30 },
          { instruction: 'Blend the soup with an immersion blender until smooth (or leave chunky). Season with salt and lemon juice. Add water if too thick.' },
          { instruction: 'In a small pan, melt butter over medium-high heat. Add cumin seeds and cook 30 seconds until they pop. Add chilli flakes. Pour this sizzling butter directly into the soup.' },
          { instruction: 'Ladle into bowls. Add a squeeze of extra lemon and drizzle of olive oil. Serve with crusty bread.' },
        ],
      },
    ],
  },

  {
    id: 'burekas',
    title: 'Cheese Burekas',
    titleHe: 'בורקס גבינה',
    category: 'snack',
    tags: ['pastry', 'cheese', 'baked', 'snack', 'Sephardic'],
    cuisine: 'Israeli / Sephardic',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=900&q=80',
    description: 'Flaky, golden pastry parcels filled with feta and kashkaval cheese. A staple of Israeli bakeries — warm from the oven, dusted with sesame.',
    prepTime: 30,
    cookTime: 25,
    servings: 12,
    difficulty: 'medium',
    source: 'Tugy',
    tips: [
      'Keep puff pastry cold — work quickly and return to fridge if it gets too warm.',
      'The egg wash is what gives burekas their signature shiny, crackly top.',
    ],
    ingredients: [
      {
        group: 'Filling',
        items: [
          { amount: 200, unit: 'g', name: 'feta cheese', note: 'crumbled' },
          { amount: 200, unit: 'g', name: 'kashkaval or gruyère', note: 'grated' },
          { amount: 2, unit: '', name: 'eggs', note: 'lightly beaten' },
          { amount: 2, unit: 'tbsp', name: 'parsley', note: 'chopped' },
          { amount: 0.25, unit: 'tsp', name: 'black pepper' },
        ],
      },
      {
        group: 'Pastry',
        items: [
          { amount: 500, unit: 'g', name: 'puff pastry sheets', note: 'cold' },
          { amount: 1, unit: '', name: 'egg', note: 'beaten, for egg wash' },
          { amount: 3, unit: 'tbsp', name: 'sesame seeds' },
        ],
      },
    ],
    steps: [
      {
        items: [
          { instruction: 'Preheat oven to 200°C. Mix all filling ingredients together until well combined.' },
          { instruction: 'Roll out puff pastry on a lightly floured surface. Cut into 12cm squares.' },
          { instruction: 'Place a generous tablespoon of filling in the centre of each square. Fold into a triangle or rectangle, pressing edges to seal firmly. Use a fork to crimp the edges.' },
          { instruction: 'Place on a lined baking sheet. Brush tops generously with egg wash. Sprinkle with sesame seeds.' },
          { instruction: 'Bake for 22-25 minutes until puffed, deep golden, and crispy. Cool slightly before eating — filling will be molten hot.', timerMinutes: 25 },
        ],
      },
    ],
  },

  {
    id: 'tahini-cookies',
    title: 'Tahini Chocolate Chunk Cookies',
    titleHe: 'עוגיות טחינה ושוקולד',
    category: 'dessert',
    tags: ['cookies', 'chocolate', 'tahini', 'baked', 'dessert'],
    cuisine: 'Israeli',
    image: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=900&q=80',
    description: 'Nutty tahini replaces most of the butter for cookies with a uniquely sesame-forward depth. Crispy edges, soft centres, and dark chocolate in every bite.',
    prepTime: 15,
    cookTime: 14,
    servings: 20,
    difficulty: 'easy',
    featured: true,
    source: 'Tugy',
    tips: [
      'Rest the dough in the fridge for 30 minutes before baking for thicker, chewier cookies.',
      'Pull them out when the centres still look underdone — they firm up as they cool.',
    ],
    ingredients: [
      {
        items: [
          { amount: 150, unit: 'g', name: 'good quality tahini' },
          { amount: 60, unit: 'g', name: 'unsalted butter', note: 'softened' },
          { amount: 150, unit: 'g', name: 'brown sugar', note: 'packed' },
          { amount: 50, unit: 'g', name: 'white sugar' },
          { amount: 2, unit: '', name: 'eggs' },
          { amount: 1, unit: 'tsp', name: 'vanilla extract' },
          { amount: 200, unit: 'g', name: 'plain flour' },
          { amount: 0.5, unit: 'tsp', name: 'baking soda' },
          { amount: 0.5, unit: 'tsp', name: 'fine salt' },
          { amount: 200, unit: 'g', name: 'dark chocolate', note: '70%, roughly chopped' },
          { amount: 1, unit: 'tbsp', name: 'sesame seeds', note: 'for topping' },
          { amount: 1, unit: 'pinch', name: 'flaky sea salt', note: 'for topping' },
        ],
      },
    ],
    steps: [
      {
        items: [
          { instruction: 'Preheat oven to 180°C. Line two baking sheets with parchment.' },
          { instruction: 'Beat tahini, butter, and both sugars together until light and fluffy — about 3 minutes. Add eggs one at a time, then vanilla.', timerMinutes: 3 },
          { instruction: 'Fold in flour, baking soda, and salt until just combined. Fold in chocolate chunks.' },
          { instruction: 'Scoop dough into 40g balls. Space well apart on baking sheets. Flatten slightly. Sprinkle with sesame seeds and flaky salt.' },
          { instruction: 'Bake for 12-14 minutes until golden at the edges but still soft in the centre. Cool on the tray for 5 minutes before transferring.', timerMinutes: 14, tip: 'They\'ll look underdone — trust the process.' },
        ],
      },
    ],
  },

  {
    id: 'fish-tahini',
    title: 'Baked Fish in Tahini',
    titleHe: 'דג בטחינה',
    category: 'dinner',
    tags: ['fish', 'tahini', 'main', 'quick', 'healthy'],
    cuisine: 'Israeli',
    image: 'https://images.unsplash.com/photo-1559628129-67cf63b72248?w=900&q=80',
    description: 'White fish fillets baked in a lemony, herbed tahini sauce — one of the most iconic dishes in Israeli home cooking. Elegant, quick, and deeply flavourful.',
    prepTime: 15,
    cookTime: 20,
    servings: 4,
    difficulty: 'easy',
    source: 'Tugy',
    ingredients: [
      {
        group: 'Tahini sauce',
        items: [
          { amount: 150, unit: 'g', name: 'tahini' },
          { amount: 2, unit: '', name: 'lemons', note: 'juiced' },
          { amount: 2, unit: 'cloves', name: 'garlic', note: 'minced' },
          { amount: 0.5, unit: 'cup', name: 'cold water' },
          { amount: 0.5, unit: 'tsp', name: 'salt' },
          { amount: 1, unit: 'handful', name: 'parsley', note: 'finely chopped' },
        ],
      },
      {
        group: 'Fish',
        items: [
          { amount: 800, unit: 'g', name: 'white fish fillets', note: 'sea bass, cod, or halibut' },
          { amount: 2, unit: 'tbsp', name: 'olive oil' },
          { amount: 0.5, unit: 'tsp', name: 'salt' },
          { amount: 0.5, unit: 'tsp', name: 'black pepper' },
          { amount: 1, unit: 'tsp', name: 'cumin' },
          { amount: 1, unit: '', name: 'onion', note: 'thinly sliced' },
        ],
      },
    ],
    steps: [
      {
        items: [
          { instruction: 'Preheat oven to 200°C. Whisk tahini with lemon juice and garlic — it will thicken. Gradually add cold water until you have a pourable, creamy sauce. Stir in parsley and salt.' },
          { instruction: 'Season fish fillets with salt, pepper, and cumin. Arrange in a baking dish. Scatter sliced onion around and over the fish.' },
          { instruction: 'Pour tahini sauce generously over everything. Drizzle with olive oil.' },
          { instruction: 'Bake for 18-22 minutes until the sauce is golden and bubbling and fish flakes easily. The tahini will form a gorgeous crust.', timerMinutes: 22, tip: 'Do not overbake — fish cooks quickly and should still be moist inside.' },
          { instruction: 'Scatter with extra parsley and a squeeze of lemon. Serve with rice or crusty bread to soak up the sauce.' },
        ],
      },
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
  snack: 'Snack & Dip',
  bread: 'Bread',
  sauce: 'Sauce',
}

export const categoryEmoji: Record<string, string> = {
  breakfast: '🍳',
  lunch: '🥙',
  dinner: '🍗',
  dessert: '🍰',
  salad: '🥗',
  soup: '🍲',
  snack: '🫙',
  bread: '🫓',
  sauce: '🫕',
}

export function getRecipe(id: string): Recipe | undefined {
  return recipes.find((r) => r.id === id)
}

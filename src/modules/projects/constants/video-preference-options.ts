// src/constants/video-preferences-options.ts

export const VIDEO_PREFERENCE_OPTIONS = {
  
  visual_style: {
    luxury_premium: {
      label: "Luxury & Premium",
      description: "High-end cinematic with rich tones, elegant lighting",
      json_values: {
        film_grain: "rich visual tone",
        composition: "premium creative framing",
        color_palette: ["signature color", "gold/silver", "neutral"],
        visual_theme: "premium brand tone"
      }
    },
    clean_minimal: {
      label: "Clean & Minimal",
      description: "Bright, professional, Apple-store aesthetic",
      json_values: {
        film_grain: "clean high-contrast digital",
        composition: "centered hero shot",
        color_palette: ["white", "light grey", "minimal accent"],
        visual_theme: "clean, professional, and refined"
      }
    },
    warm_natural: {
      label: "Warm & Natural",
      description: "Cozy, approachable, golden hour vibes",
      json_values: {
        film_grain: "soft warm LUT for cozy tone",
        composition: "natural lifestyle framing",
        color_palette: ["warm oranges", "cream", "golden yellow"],
        visual_theme: "inviting, comfortable, and aspirational"
      }
    },
    futuristic_tech: {
      label: "Futuristic & Tech",
      description: "Neon, digital, high-tech aesthetic",
      json_values: {
        film_grain: "clean high-contrast digital with neon LUT",
        composition: "close-up macro with tech elements",
        color_palette: ["neon blue", "black", "chrome silver"],
        visual_theme: "innovative, futuristic"
      }
    }
  },

  lighting_mood: {
    dramatic_cinematic: {
      label: "Dramatic & Cinematic",
      description: "High contrast shadows, film noir aesthetic",
      json_values: {
        lighting: "dramatic chiaroscuro lighting with deep shadows",
        time_of_day: "nighttime glow",
        environment: "atmospheric with strong visual geometry",
        tone: "suspenseful, dramatic, and intriguing"
      }
    },
    bright_professional: {
      label: "Bright & Professional",
      description: "Even lighting, corporate, clean",
      json_values: {
        lighting: "even, soft lighting with minimal shadows",
        time_of_day: "neutral lighting setup",
        environment: "minimal, uncluttered space",
        tone: "clean, professional, and refined"
      }
    },
    golden_hour: {
      label: "Golden Hour & Warm",
      description: "Natural warm lighting, cozy atmosphere",
      json_values: {
        lighting: "warm, natural lighting with golden tones",
        time_of_day: "late afternoon golden hour",
        environment: "cozy, lived-in space with personal touches",
        tone: "inviting, comfortable, and aspirational"
      }
    },
    studio_controlled: {
      label: "Studio & Controlled",
      description: "Perfect lighting setup, product focused",
      json_values: {
        lighting: "controlled studio lighting with reflections",
        time_of_day: "studio timeless",
        environment: "dark background with focused highlights",
        tone: "luxurious, premium"
      }
    }
  },

  camera_style: {
    smooth_cinematic: {
      label: "Smooth Cinematic",
      description: "Dolly movements, professional camera work",
      json_values: {
        camera_motion: "smooth dolly sideways across scene",
        frame_rate: "24fps cinematic",
        shot_style: "wide shot establishing scene",
        voice_style: "cinematic narration"
      }
    },
    dynamic_engaging: {
      label: "Dynamic & Engaging",
      description: "Active movement, modern social media style",
      json_values: {
        camera_motion: "dynamic motion with energy",
        frame_rate: "30fps",
        shot_style: "multiple angles with cuts",
        voice_style: "energetic delivery"
      }
    },
    steady_professional: {
      label: "Steady & Professional",
      description: "Locked camera, talking head style",
      json_values: {
        camera_motion: "locked camera with gentle push-in",
        frame_rate: "30fps for natural delivery",
        shot_style: "medium close-up centered",
        voice_style: "clear delivery"
      }
    },
    product_focused: {
      label: "Product Focused",
      description: "Rotating, macro shots, detail oriented",
      json_values: {
        camera_motion: "slow 360-degree pan with reflections",
        frame_rate: "60fps for fluid highlights",
        shot_style: "macro close-up with shallow depth",
        voice_style: "confident product narration"
      }
    }
  },

  subject_focus: {
    person_speaking: {
      label: "Person Speaking",
      description: "Individual talking directly to camera",
      json_values: {
        subject_description: "professional person, approachable appearance",
        wardrobe: "business casual or smart casual",
        action: "speaking directly to camera with gestures"
      }
    },
    product_showcase: {
      label: "Product Showcase",
      description: "Physical product as hero element",
      json_values: {
        subject_description: "sleek consumer product or device",
        wardrobe: "N/A",
        action: "rotating elegantly under spotlight"
      }
    },
    lifestyle_scene: {
      label: "Lifestyle Scene",
      description: "People in real-world scenarios",
      json_values: {
        subject_description: "person in natural environment",
        wardrobe: "stylish casual wear, contextual",
        action: "natural lifestyle activity"
      }
    },
    abstract_concept: {
      label: "Abstract & Conceptual",
      description: "Digital elements, graphics, animations",
      json_values: {
        subject_description: "digital elements and visual metaphors",
        wardrobe: "N/A",
        action: "animated overlays and transitions"
      }
    }
  },

  location_environment: {
    studio_minimal: {
      label: "Studio & Minimal",
      description: "Clean studio setup, controlled environment",
      json_values: {
        location: "modern studio with minimal backdrop",
        environment: "clean, professional, uncluttered",
        background_elements: "minimal props, focused lighting",
        ambient: "subtle electronic hum"
      }
    },
    office_professional: {
      label: "Office & Professional",
      description: "Modern office, business environment",
      json_values: {
        location: "modern office with natural lighting",
        environment: "bright, professional, productivity-focused",
        background_elements: "office furniture, plants, windows",
        ambient: "soft office background hush"
      }
    },
    lifestyle_natural: {
      label: "Lifestyle & Natural",
      description: "Cafes, homes, outdoor spaces",
      json_values: {
        location: "urban café or home setting",
        environment: "cozy, lived-in, authentic",
        background_elements: "natural textures, warm lighting",
        ambient: "murmur of café, clinking cups"
      }
    },
    luxury_premium: {
      label: "Luxury & Premium",
      description: "High-end spaces, elegant settings",
      json_values: {
        location: "black velvet background or luxury interior",
        environment: "sophisticated, focused on elegance",
        background_elements: "reflective surfaces, premium materials",
        ambient: "subtle ticking, metallic resonance"
      }
    }
  }

};
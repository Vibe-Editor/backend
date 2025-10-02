import { Injectable } from '@nestjs/common';

@Injectable()
export class QuestionsService {
  getQuestions() {
    return {
      video_type_selection: {
        product_showcase: {
          description: 'Focus on showcasing a product or object',
          default_values: {
            subject_type: 'object',
            camera_movement: 'orbital_rotation',
            composition: 'centered_hero',
          },
          s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/9f69d9b4-5119-453c-a4ba-24d784e9d157.mp4',
        },
        talking_head: {
          description: 'Person speaking directly to camera',
          default_values: {
            subject_type: 'person',
            camera_movement: 'static',
            composition: 'medium_closeup',
          },
          s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/2817b69e-cfc6-4d8c-aeac-7ec661415478.mp4',
        },
        third_person_ad: {
          description: 'Cinematic storytelling with characters',
          default_values: {
            subject_type: 'person_in_scene',
            camera_movement: 'dynamic_tracking',
            composition: 'rule_of_thirds',
          },
          s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/85b4f51e-d14d-4c34-a693-5e0caeca0e66.mp4',
        },
        project_explainer: {
          description: 'Abstract concepts and visual metaphors',
          default_values: {
            subject_type: 'abstract_concept',
            camera_movement: 'reveal_pullback',
            composition: 'macro_to_wide',
          },
          s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/a65c4a10-cd28-4f12-ac0e-84542d614f20.mp4',
        },
      },
      preference_questions: {
        subject_focus: {
          question: 'Who or what should be the main subject?',
          options: [
            {
              id: 'person_vr',
              label: 'Person with VR/Tech',
              image_description: 'Person wearing VR headset in minimal setting',
              s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/a65c4a10-cd28-4f12-ac0e-84542d614f20.mp4',
              prompt_values: {
                subject_description: 'A person in their mid-20s, androgynous appearance',
                props: 'Sleek VR headset with glossy black front plate',
                wardrobe: 'Simple, dark grey hoodie',
              },
            },
            {
              id: 'abstract_pixel',
              label: 'Abstract Digital Elements',
              image_description: 'Macro shot of pixels/digital screens',
              s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/cb4c8090-ed9b-4bc9-b3de-48ddb12a6c05.mp4',
              prompt_values: {
                subject_description: 'Digital pixels and screen elements',
                props: 'Glowing pixels, digital interfaces',
                composition_start: 'extreme_macro_pixel',
              },
            },
            {
              id: 'product_object',
              label: 'Physical Product',
              image_description: 'Clean product shot on minimal background',
              s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/66e47eda-2f3c-40b0-8e79-16cd2e42a993.mp4',
              prompt_values: {
                subject_description: 'Sleek consumer product',
                props: 'Modern tech device or object',
                composition: 'centered_hero_shot',
              },
            },
            {
              id: 'environment_space',
              label: 'Location/Environment',
              image_description: 'Atmospheric room or space',
              s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/f53fd98d-7ab0-4bc3-aad0-dbb302004517.mp4',
              prompt_values: {
                subject_description: 'The space itself as subject',
                location: 'Architecturally interesting environment',
                focus: 'environmental_storytelling',
              },
            },
          ],
        },
        mood_tone: {
          question: 'What overall feeling should it have?',
          options: [
            {
              id: 'corporate_eerie',
              label: 'Corporate & Unsettling',
              image_description: 'Cool blue light, sterile environment, isolated figure',
              s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/2817b69e-cfc6-4d8c-aeac-7ec661415478.mp4',
              prompt_values: {
                lighting: 'High-contrast, low-key lighting with cool LED',
                color_palette: 'Desaturated blues, cool greys, deep blacks',
                tone: 'Tense, confining, and clinical',
                environment: 'Sparse, sterile environment',
              },
            },
            {
              id: 'warm_hopeful',
              label: 'Warm & Optimistic',
              image_description: 'Golden hour lighting, comfortable space, inviting atmosphere',
              s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/85b4f51e-d14d-4c34-a693-5e0caeca0e66.mp4',
              prompt_values: {
                lighting: 'Warm, natural lighting with golden tones',
                color_palette: 'Warm oranges, soft yellows, natural browns',
                tone: 'Inviting, comfortable, and aspirational',
                environment: 'Cozy, lived-in space with personal touches',
              },
            },
            {
              id: 'mysterious_cinematic',
              label: 'Mysterious & Dramatic',
              image_description: 'High contrast shadows, dramatic angles, film noir aesthetic',
              s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/659d4720-2949-468e-8510-cf99f5cbe2d2.mp4',
              prompt_values: {
                lighting: 'Dramatic chiaroscuro lighting with deep shadows',
                color_palette: 'High contrast blacks and whites with accent colors',
                tone: 'Suspenseful, dramatic, and intriguing',
                environment: 'Atmospheric with strong visual geometry',
              },
            },
            {
              id: 'bright_minimal',
              label: 'Clean & Minimal',
              image_description: 'Even white lighting, clean surfaces, Apple-store aesthetic',
              s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/ee51b27d-7e04-464f-ae92-da4feb370903.mp4',
              prompt_values: {
                lighting: 'Even, soft lighting with minimal shadows',
                color_palette: 'Pure whites, light greys, minimal color accents',
                tone: 'Clean, professional, and refined',
                environment: 'Minimal, uncluttered space',
              },
            },
          ],
        },
        environment_space: {
          question: 'Where should this take place?', 
          options: [
            {
              id: 'minimal_room',
              label: 'Minimal Indoor Space',
              image_description: 'Clean, sparse room with minimal furniture',
              s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/ee51b27d-7e04-464f-ae92-da4feb370903.mp4',
              prompt_values: {
                location: 'Indistinct, minimalist room',
                environment: 'Sparse, almost sterile environment',
                background: 'Out of focus and clean',
              },
            },
            {
              id: 'futuristic_void',
              label: 'Futuristic Void/Studio',
              image_description: 'Infinite black background with selective lighting',
              s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/cb4c8090-ed9b-4bc9-b3de-48ddb12a6c05.mp4',
              prompt_values: {
                location: 'Infinite black void or cyclorama studio',
                environment: 'Completely abstract, no visible boundaries',
                background: 'Pure black or gradient void',
              },
            },
            {
              id: 'natural_outdoor',
              label: 'Natural Environment',
              image_description: 'Outdoor setting with natural elements',
              s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/882639cc-abdb-4f83-bd0b-df6e5c6e71d5.mp4',
              prompt_values: {
                location: 'Natural outdoor environment',
                environment: 'Organic, with natural textures and lighting',
                background: 'Natural elements, trees, sky, or landscape',
              },
            },
            {
              id: 'digital_abstract',
              label: 'Digital/Abstract Space',
              image_description: 'Geometric patterns, digital interfaces, cyber environment',
              s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/eb179bcd-4096-4386-823c-d350cf45d4c3.mp4',
              prompt_values: {
                location: 'Abstract digital environment',
                environment: 'Geometric, with digital elements and interfaces',
                background: 'Animated digital patterns or data visualization',
              },
            },
          ],
        },
        visual_style: {
          question: 'What color scheme and lighting style?',
          options: [
            {
              id: 'cool_corporate',
              label: 'Cool Blues & Corporate',
              image_description: 'Blue LED lighting, sterile corporate aesthetic',
              s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/d68b2032-3ffd-4cc8-8044-91f4cf9a008d.mp4',
              prompt_values: {
                color_palette: 'Dominated by desaturated blues, cool greys, deep blacks',
                lighting: 'Cool, blue-white LED lighting with high contrast',
                visual_tone: 'Corporate, clinical, technology-focused',
              },
            },
            {
              id: 'warm_cinematic',
              label: 'Warm Cinematic Tones',
              image_description: 'Golden hour lighting, warm orange/amber tones',
              s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/6c7f3cfa-ae2c-47b0-9b9e-064443a3ea9e.mp4',
              prompt_values: {
                color_palette: 'Warm oranges, golden yellows, rich browns',
                lighting: 'Warm, directional lighting with soft shadows',
                visual_tone: 'Cinematic, emotional, human-centered',
              },
            },
            {
              id: 'high_contrast',
              label: 'High Contrast B&W',
              image_description: 'Dramatic black and white with sharp shadows',
              s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/588a5440-b90e-4efb-9efe-884f50f13dc8.mp4',
              prompt_values: {
                color_palette: 'High contrast black and white with selective color',
                lighting: 'Hard lighting with deep shadows and bright highlights',
                visual_tone: 'Dramatic, artistic, film noir inspired',
              },
            },
            {
              id: 'neon_cyberpunk',
              label: 'Neon Cyberpunk',
              image_description: 'Bright neon colors, purple/pink/cyan palette',
              s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/c932918b-694a-4f13-b634-2285ae9f47ff.mp4',
              prompt_values: {
                color_palette: 'Vibrant neons: hot pink, electric blue, acid green',
                lighting: 'Colored LED strips and neon practical lights',
                visual_tone: 'Futuristic, edgy, high-tech underground',
              },
            },
          ],
        },
        camera_movement: {
          question: 'What kind of camera movement?',
          options: [
            {
              id: 'slow_pullback',
              label: 'Slow Reveal Pull-back',
              image_description: 'Camera slowly pulling back from macro to wide shot',
              s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/8bcf93d6-95a3-45e1-9390-6f0be5e74f52.mp4',
              prompt_values: {
                camera_movement: 'Precise, slow pull-back on motion-controlled slider',
                shot_progression: 'Extreme macro to Medium Close-Up',
                movement_feeling: 'Almost imperceptible at first, gradual reveal',
              },
            },
            {
              id: 'orbital_rotation',
              label: 'Orbital/Rotating Movement',
              image_description: 'Camera rotating around subject in smooth arc',
              s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/a019d446-45b5-4e77-b7af-917532e27fa6.mp4',
              prompt_values: {
                camera_movement: 'Smooth orbital movement around subject',
                shot_progression: '360-degree or partial rotation reveal',
                movement_feeling: 'Dynamic, showcasing dimensionality',
              },
            },
            {
              id: 'static_locked',
              label: 'Static & Locked',
              image_description: 'Fixed camera position, no movement',
              s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/e3d5ba08-1072-464a-8e76-54609f8c97b5.mp4',
              prompt_values: {
                camera_movement: 'Completely static, tripod-locked',
                shot_progression: 'Single fixed framing throughout',
                movement_feeling: 'Stable, focused, contemplative',
              },
            },
            {
              id: 'dynamic_tracking',
              label: 'Dynamic Tracking',
              image_description: 'Camera following or tracking subject movement',
              s3_key: 'https://ds0fghatf06yb.cloudfront.net/cmfl73asq03m3p0il6r1q3uti/videos/cmfl7g1ux03n5p0ilgu9yhovk/a8a64c85-30a2-4e27-aac0-e9c87f6dd970.mp4',
              prompt_values: {
                camera_movement: 'Fluid tracking and following movements',
                shot_progression: 'Multiple angle changes and following shots',
                movement_feeling: 'Energetic, immersive, following action',
              },
            },
          ],
        },
      },
    };
  }
}

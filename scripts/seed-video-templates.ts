import { PrismaClient } from '../generated/prisma';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface TemplateData {
  description: string;
  'json-prompt': string;
  S3key: string;
}

async function seedVideoTemplates() {
  try {
    console.log('🌱 Starting video template seeding...');

    const tempJsonPath = path.join(__dirname, '../src/modules/questions/temp.json');
    const templatesData: TemplateData[] = JSON.parse(fs.readFileSync(tempJsonPath, 'utf8'));

    console.log(`📊 Found ${templatesData.length} templates to seed`);

    await prisma.videoTemplate.deleteMany({});
    console.log('🗑️  Cleared existing video templates');

    const createdTemplates = [];

    for (const template of templatesData) {
      const created = await prisma.videoTemplate.create({
        data: {
          description: template.description,
          jsonPrompt: template['json-prompt'],
          s3Key: template.S3key,
        },
      });
      createdTemplates.push(created);
      console.log(`✅ Created template: ${template.description.substring(0, 50)}...`);
    }

    console.log(`🎉 Successfully seeded ${createdTemplates.length} video templates!`);
    
    const totalCount = await prisma.videoTemplate.count();
    console.log(`📈 Total templates in database: ${totalCount}`);

  } catch (error) {
    console.error('❌ Error seeding video templates:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  seedVideoTemplates()
    .then(() => {
      console.log('✨ Seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Seeding failed:', error);
      process.exit(1);
    });
}

export { seedVideoTemplates };

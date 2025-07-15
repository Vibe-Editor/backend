import { Injectable } from '@nestjs/common';
import { GetWebInfoDto } from './dto/get-web-info.dto';

@Injectable()
export class GetWebInfoService {
    async getWebInfo(getWebInfoDto: GetWebInfoDto) {
        const { prompt } = getWebInfoDto;

        try {
            const response = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'sonar',
                    messages: [
                        { role: 'user', content: prompt }
                    ],
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            throw new Error(`Failed to get web info: ${error.message}`);
        }
    }
}

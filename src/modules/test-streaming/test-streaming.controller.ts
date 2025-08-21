import { Controller, Get, Res, Header, Query } from '@nestjs/common';
import { Response } from 'express';

@Controller('test-streaming')
export class TestStreamingController {
  
  // Basic text streaming - good for curl testing
  @Get('text')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Transfer-Encoding', 'chunked')
  streamText(@Res() res: Response, @Query('count') count?: string) {
    const maxChunks = count ? parseInt(count) : 10;
    
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    let chunkNum = 0;
    const interval = setInterval(() => {
      const message = `📦 Chunk ${chunkNum++}: ${new Date().toISOString()}\n`;
      res.write(message);
      
      if (chunkNum >= maxChunks) {
        clearInterval(interval);
        res.end('\n✅ Streaming complete! All chunks sent.\n');
      }
    }, 1000);

    res.on('close', () => {
      clearInterval(interval);
      console.log('📤 Client disconnected from text stream');
    });
  }

  // JSON streaming - perfect for API testing
  @Get('json')
  @Header('Content-Type', 'application/json')
  @Header('Transfer-Encoding', 'chunked')
  streamJson(@Res() res: Response, @Query('delay') delay?: string) {
    const streamDelay = delay ? parseInt(delay) : 800;
    
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const testData = [
      { type: 'info', message: 'Starting stream test...', status: 'initializing' },
      { type: 'progress', message: 'Processing data chunk 1', progress: 25 },
      { type: 'progress', message: 'Processing data chunk 2', progress: 50 },
      { type: 'progress', message: 'Processing data chunk 3', progress: 75 },
      { type: 'success', message: 'All data processed!', progress: 100 },
      { type: 'complete', message: 'Stream finished', final: true }
    ];

    let index = 0;
    const interval = setInterval(() => {
      if (index < testData.length) {
        const chunk = {
          id: index,
          timestamp: new Date().toISOString(),
          ...testData[index]
        };
        
        res.write(`${JSON.stringify(chunk)}\n`);
        index++;
      } else {
        clearInterval(interval);
        res.end();
      }
    }, streamDelay);

    res.on('close', () => {
      clearInterval(interval);
      console.log('📤 Client disconnected from JSON stream');
    });
  }

  // Server-Sent Events - best for frontend testing
  @Get('sse')
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  streamSSE(@Res() res: Response, @Query('events') eventCount?: string) {
    const maxEvents = eventCount ? parseInt(eventCount) : 10;
    
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Send connection established event
    res.write('data: {"type": "connection", "message": "SSE stream connected", "status": "ready"}\n\n');

    let eventId = 1;
    const interval = setInterval(() => {
      const data = {
        id: eventId,
        type: 'update',
        message: `Event #${eventId}`,
        serverTime: new Date().toLocaleString(),
        randomValue: Math.floor(Math.random() * 1000),
        progress: Math.round((eventId / maxEvents) * 100)
      };
      
      res.write(`id: ${eventId}\n`);
      res.write(`event: update\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      
      eventId++;
      
      if (eventId > maxEvents) {
        res.write('event: complete\n');
        res.write('data: {"type": "complete", "message": "All events sent", "totalEvents": ' + maxEvents + '}\n\n');
        clearInterval(interval);
        res.end();
      }
    }, 1500);

    res.on('close', () => {
      clearInterval(interval);
      console.log('📤 SSE client disconnected');
    });
  }

  // AI-style streaming - simulates ChatGPT/Claude responses
  @Get('ai-simulation')
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  streamAIResponse(@Res() res: Response, @Query('speed') speed?: string) {
    const streamSpeed = speed === 'fast' ? 50 : speed === 'slow' ? 200 : 100;
    
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const responses = [
      "Hey there! This is a simulated AI response that streams word by word.",
      "You can test different streaming speeds by adding ?speed=fast or ?speed=slow to the URL.",
      "This is perfect for testing real-time chat interfaces and streaming responses.",
      "Hope this helps you test your streaming implementation! Let me know if you need anything else."
    ];

    const fullResponse = responses.join(' ');
    const words = fullResponse.split(' ');
    let wordIndex = 0;
    let currentSentence = '';

    const streamWords = () => {
      if (wordIndex < words.length) {
        currentSentence += (wordIndex > 0 ? ' ' : '') + words[wordIndex];
        
        const chunk = {
          id: wordIndex,
          type: 'token',
          content: words[wordIndex],
          fullContent: currentSentence,
          isComplete: false,
          position: wordIndex,
          totalWords: words.length
        };
        
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        wordIndex++;
        
        setTimeout(streamWords, streamSpeed + Math.random() * 50);
      } else {
        // Send completion signal
        const finalChunk = {
          type: 'complete',
          fullContent: currentSentence,
          isComplete: true,
          totalWords: words.length,
          processingTime: Date.now()
        };
        
        res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
        res.end();
      }
    };

    // Start streaming after brief delay
    setTimeout(streamWords, 300);

    res.on('close', () => {
      console.log('📤 AI simulation client disconnected');
    });
  }

  // Health check endpoint
  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      message: 'Test streaming module is ready',
      endpoints: [
        'GET /test-streaming/text?count=5',
        'GET /test-streaming/json?delay=500', 
        'GET /test-streaming/sse?events=15',
        'GET /test-streaming/ai-simulation?speed=fast'
      ],
      timestamp: new Date().toISOString()
    };
  }
}
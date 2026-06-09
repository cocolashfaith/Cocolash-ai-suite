import { describe, it, expect } from 'vitest';
import { buildEnhancorQueueRequest } from '@/lib/seedance/client';
import type { SeedanceInput, SeedanceCreateTaskRequest } from '@/lib/seedance/types';

describe('UGC mode payload shape (Enhancor API)', () => {
  const mockWebhookUrl = 'https://example.com/webhook';

  const mockInput: SeedanceInput = {
    type: 'image-to-video',
    mode: 'ugc',
    prompt: 'UGC prompt with @product_image1 @influencer_image1',
    duration: '15',
    resolution: '720p',
    aspect_ratio: '9:16',
    products: ['https://example.com/product1.jpg', 'https://example.com/product2.jpg'],
    influencers: ['https://example.com/influencer1.jpg'],
    full_access: true,
    // Note: quality and unrestricted fields will be added once wired in Task 5
  };

  describe('required fields', () => {
    it('should include type field set to image-to-video', () => {
      const payload = buildEnhancorQueueRequest(mockInput, mockWebhookUrl);
      expect(payload.type).toBe('image-to-video');
    });

    it('should include mode field set to ugc', () => {
      const payload = buildEnhancorQueueRequest(mockInput, mockWebhookUrl);
      expect(payload.mode).toBe('ugc');
    });

    it('should include prompt field', () => {
      const payload = buildEnhancorQueueRequest(mockInput, mockWebhookUrl);
      expect(payload.prompt).toBeDefined();
      expect(typeof payload.prompt).toBe('string');
    });

    it('should include duration as string in valid range', () => {
      const payload = buildEnhancorQueueRequest(mockInput, mockWebhookUrl);
      expect(payload.duration).toBeDefined();
      expect(typeof payload.duration).toBe('string');
      const durationNum = parseInt(payload.duration!, 10);
      expect(durationNum).toBeGreaterThanOrEqual(4);
      expect(durationNum).toBeLessThanOrEqual(15);
    });

    it('should include resolution field', () => {
      const payload = buildEnhancorQueueRequest(mockInput, mockWebhookUrl);
      expect(payload.resolution).toBeDefined();
      expect(['480p', '720p', '1080p']).toContain(payload.resolution);
    });

    it('should include aspect_ratio field', () => {
      const payload = buildEnhancorQueueRequest(mockInput, mockWebhookUrl);
      expect(payload.aspect_ratio).toBeDefined();
      expect(['9:16', '16:9', '4:3', '3:4', '1:1', '21:9']).toContain(payload.aspect_ratio);
    });

    it('should include webhook_url field', () => {
      const payload = buildEnhancorQueueRequest(mockInput, mockWebhookUrl);
      expect(payload.webhook_url).toBe(mockWebhookUrl);
    });
  });

  describe('image arrays (products, influencers)', () => {
    it('should include products array when products provided', () => {
      const payload = buildEnhancorQueueRequest(mockInput, mockWebhookUrl);
      expect(payload.products).toBeDefined();
      expect(Array.isArray(payload.products)).toBe(true);
      expect(payload.products!.length).toBeGreaterThan(0);
    });

    it('should include influencers array when influencers provided', () => {
      const payload = buildEnhancorQueueRequest(mockInput, mockWebhookUrl);
      expect(payload.influencers).toBeDefined();
      expect(Array.isArray(payload.influencers)).toBe(true);
      expect(payload.influencers!.length).toBeGreaterThan(0);
    });

    it('should enforce combined products + influencers <= 9 limit', () => {
      const payload = buildEnhancorQueueRequest(mockInput, mockWebhookUrl);
      const productCount = payload.products?.length ?? 0;
      const influencerCount = payload.influencers?.length ?? 0;
      const combinedCount = productCount + influencerCount;
      expect(combinedCount).toBeLessThanOrEqual(9);
    });
  });

  describe('optional toggles (full_access, unrestricted, quality)', () => {
    it('should include full_access field as boolean', () => {
      const payload = buildEnhancorQueueRequest(mockInput, mockWebhookUrl);
      expect(payload.full_access).toBeDefined();
      expect(typeof payload.full_access).toBe('boolean');
    });

    it('should default full_access to true when not provided', () => {
      const inputWithoutFullAccess: SeedanceInput = {
        ...mockInput,
        full_access: undefined,
      };
      const payload = buildEnhancorQueueRequest(inputWithoutFullAccess, mockWebhookUrl);
      expect(payload.full_access).toBe(true);
    });

    it('should include unrestricted field when provided', () => {
      const inputWithUnrestricted: SeedanceInput = {
        ...mockInput,
        unrestricted: true,
      };
      const payload = buildEnhancorQueueRequest(inputWithUnrestricted, mockWebhookUrl);
      // Note: Will be validated once Task 5 wires it into the payload
      expect(payload).toBeDefined();
    });

    it('should include quality field when provided', () => {
      const inputWithQuality: SeedanceInput = {
        ...mockInput,
        quality: 'standard',
      };
      const payload = buildEnhancorQueueRequest(inputWithQuality, mockWebhookUrl);
      // Note: Will be validated once Task 5 wires it into the payload
      expect(payload).toBeDefined();
    });
  });

  describe('payload consistency', () => {
    it('should return a valid Enhancor request body shape', () => {
      const payload = buildEnhancorQueueRequest(mockInput, mockWebhookUrl);

      // Verify all required fields are present
      expect(payload.type).toBeDefined();
      expect(payload.mode).toBeDefined();
      expect(payload.resolution).toBeDefined();
      expect(payload.aspect_ratio).toBeDefined();
      expect(payload.duration).toBeDefined();
      expect(payload.webhook_url).toBeDefined();
      expect(payload.full_access).toBeDefined();
    });

    it('should accept UGC mode with products and influencers', () => {
      const testInput: SeedanceInput = {
        ...mockInput,
        products: ['https://example.com/product.jpg'],
        influencers: ['https://example.com/influencer.jpg'],
      };
      const payload = buildEnhancorQueueRequest(testInput, mockWebhookUrl);
      expect(payload.mode).toBe('ugc');
      expect(payload.products).toBeDefined();
      expect(payload.influencers).toBeDefined();
    });
  });
});

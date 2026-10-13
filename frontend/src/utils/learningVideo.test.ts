import { expect, it } from 'vitest';
import { learningVideoEmbed } from './learningVideo';
it.each(['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ?t=20', 'https://youtube.com/shorts/dQw4w9WgXcQ', 'https://youtube.com/embed/dQw4w9WgXcQ'])('supports YouTube %s', url => expect(learningVideoEmbed(url)).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'));
it('supports public Vimeo links', () => expect(learningVideoEmbed('https://vimeo.com/123456789')).toBe('https://player.vimeo.com/video/123456789'));
it.each(['', 'javascript:alert(1)', '<iframe src="https://youtube.com"></iframe>', 'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ', 'http://youtu.be/dQw4w9WgXcQ', 'https://user@youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com:8443/watch?v=dQw4w9WgXcQ', 'https://youtube.com/watch?v=bad', 'https://vimeo.com/channels/12', 'https://evil.test/video'])('rejects unsafe or unsupported input %s', url => expect(learningVideoEmbed(url)).toBeNull());

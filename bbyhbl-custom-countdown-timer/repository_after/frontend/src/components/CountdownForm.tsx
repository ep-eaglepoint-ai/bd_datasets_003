import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { z } from 'zod';
import { Palette, Image, Calendar, Clock, Globe } from 'lucide-react';
import { DateTime } from 'luxon';
import { unsplashApi } from '../api/client';

const countdownSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100),
  description: z.string().max(500).optional(),
  targetDate: z.string().min(1, 'Target date is required'),
  targetTime: z.string().min(1, 'Target time is required'),
  timezone: z.string(),
  backgroundColor: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid color'),
  textColor: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid color'),
  accentColor: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid color'),
  theme: z.enum(['minimal', 'celebration', 'elegant', 'neon']),
  backgroundImage: z.string().url('Invalid URL').optional().or(z.literal('')),
  isPublic: z.boolean(),
});

type CountdownFormData = z.infer<typeof countdownSchema>;

const themes = [
  { id: 'minimal', name: 'Minimal', colors: { bg: '#1a1a1a', text: '#ffffff', accent: '#3b82f6' } },
  { id: 'celebration', name: 'Celebration', colors: { bg: '#ff6b6b', text: '#ffffff', accent: '#ffe66d' } },
  { id: 'elegant', name: 'Elegant', colors: { bg: '#2c3e50', text: '#ecf0f1', accent: '#9b59b6' } },
  { id: 'neon', name: 'Neon', colors: { bg: '#000000', text: '#00ff00', accent: '#ff00ff' } },
];

interface CountdownFormProps {
  onSubmit: (data: any) => void;
  isLoading?: boolean;
  initialData?: Partial<CountdownFormData>;
}

const CountdownForm: React.FC<CountdownFormProps> = ({ onSubmit, isLoading = false, initialData }) => {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<CountdownFormData>({
    resolver: zodResolver(countdownSchema),
    defaultValues: {
      theme: 'minimal',
      backgroundColor: '#000000',
      textColor: '#FFFFFF',
      accentColor: '#3B82F6',
      isPublic: true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...initialData,
    },
  });
  const selectedTheme = watch('theme');
  const backgroundColor = watch('backgroundColor');
  const textColor = watch('textColor');
  const accentColor = watch('accentColor');
  const currentBackgroundImage = watch('backgroundImage');

  const [unsplashQuery, setUnsplashQuery] = React.useState('');
  const [unsplashResults, setUnsplashResults] = React.useState<Array<{ id: string; small: string; regular: string; full: string; alt?: string | null; credit?: string }>>([]);
  const [unsplashLoading, setUnsplashLoading] = React.useState(false);
  const [unsplashError, setUnsplashError] = React.useState<string | null>(null);
  const handleThemeSelect = (themeId: string) => {
    const theme = themes.find(t => t.id === themeId);
    if (theme) {
      setValue('backgroundColor', theme.colors.bg);
      setValue('textColor', theme.colors.text);
      setValue('accentColor', theme.colors.accent);
      setValue('theme', themeId as any);
    }
  };
  const onSubmitForm = (data: CountdownFormData) => {
    const dt = DateTime.fromISO(`${data.targetDate}T${data.targetTime}`, { zone: data.timezone });
    const targetDateTime = dt.toUTC();
    onSubmit({
      title: data.title,
      description: data.description || undefined,
      targetDate: targetDateTime.toISO(),
      timezone: data.timezone,
      backgroundColor: data.backgroundColor,
      textColor: data.textColor,
      accentColor: data.accentColor,
      theme: data.theme,
      backgroundImage: data.backgroundImage || undefined,
      isPublic: data.isPublic,
    });
  };

  const searchUnsplash = async () => {
    const q = unsplashQuery.trim();
    if (!q) return;
    setUnsplashLoading(true);
    setUnsplashError(null);
    try {
      const resp = await unsplashApi.search(q, 12);
      setUnsplashResults(resp.data.data || []);
    } catch (e: any) {
      setUnsplashError(e?.response?.data?.error || 'Failed to search Unsplash');
    } finally {
      setUnsplashLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmitForm)} className="max-w-2xl mx-auto p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div 
          className="p-8 rounded-2xl mb-6 text-center"
          style={{ backgroundColor, color: textColor }}
        >
          <h3 className="text-2xl font-bold mb-2">Event Preview</h3>
          <p className="text-lg opacity-90">Your countdown will look like this</p>
          <div className="mt-4 flex gap-4 justify-center">
            {['3', '14', '25', '07'].map((num, i) => (
              <div
                key={i}
                className="text-3xl font-bold px-4 py-2 rounded-lg"
                style={{ 
                  backgroundColor: accentColor,
                  color: textColor
                }}
              >
                {num}
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <Calendar size={20} />
          </h3>
          
          <div>
              <label htmlFor="countdown-title" className="block text-sm font-medium mb-1">Event Title *</label>
            <input
                id="countdown-title"
              type="text"
              {...register('title')}
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., My Birthday, Product Launch"
            />
            {errors.title && (
              <p className="text-red-500 text-sm mt-1">{errors.title.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="countdown-description" className="block text-sm font-medium mb-1">Description (Optional)</label>
            <textarea
              id="countdown-description"
              {...register('description')}
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Add a description for your event..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="countdown-target-date" className="block text-sm font-medium mb-1">Target Date *</label>
              <input
                id="countdown-target-date"
                type="date"
                {...register('targetDate')}
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              {errors.targetDate && (
                <p className="text-red-500 text-sm mt-1">{errors.targetDate.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="countdown-target-time" className="block text-sm font-medium mb-1">Target Time *</label>
              <input
                id="countdown-target-time"
                type="time"
                {...register('targetTime')}
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              {errors.targetTime && (
                <p className="text-red-500 text-sm mt-1">{errors.targetTime.message}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="countdown-timezone" className="block text-sm font-medium mb-1 flex items-center gap-2">
              <Globe size={16} />
              Timezone
            </label>
            <select
              id="countdown-timezone"
              {...register('timezone')}
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="UTC">UTC</option>
              <option value="Africa/Addis_Ababa">Ethiopia (EAT)</option>
              <option value="America/New_York">Eastern Time (ET)</option>
              <option value="America/Chicago">Central Time (CT)</option>
              <option value="America/Los_Angeles">Pacific Time (PT)</option>
              <option value="Europe/London">London (GMT)</option>
            </select>
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <Palette size={20} />
            Theme & Styling
          </h3>

          <div>
            <label className="block text-sm font-medium mb-2">Preset Themes</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => handleThemeSelect(theme.id)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    selectedTheme === theme.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
                  }`}
                  style={{ backgroundColor: theme.colors.bg }}
                >
                  <div className="text-center">
                    <div 
                      className="text-sm font-semibold mb-1"
                      style={{ color: theme.colors.text }}
                    >
                      {theme.name}
                    </div>
                    <div className="flex justify-center gap-1">
                      {[theme.colors.bg, theme.colors.text, theme.colors.accent].map((color, i) => (
                        <div
                          key={i}
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="countdown-background-color" className="block text-sm font-medium mb-1">Background Color</label>
              <div className="flex gap-2">
                <input
                  id="countdown-background-color"
                  type="color"
                  {...register('backgroundColor')}
                  className="w-12 h-12 cursor-pointer"
                />
                <input
                  type="text"
                  {...register('backgroundColor')}
                  className="flex-1 p-2 border rounded"
                />
              </div>
            </div>

            <div>
              <label htmlFor="countdown-text-color" className="block text-sm font-medium mb-1">Text Color</label>
              <div className="flex gap-2">
                <input
                  id="countdown-text-color"
                  type="color"
                  {...register('textColor')}
                  className="w-12 h-12 cursor-pointer"
                />
                <input
                  type="text"
                  {...register('textColor')}
                  className="flex-1 p-2 border rounded"
                />
              </div>
            </div>

            <div>
              <label htmlFor="countdown-accent-color" className="block text-sm font-medium mb-1">Accent Color</label>
              <div className="flex gap-2">
                <input
                  id="countdown-accent-color"
                  type="color"
                  {...register('accentColor')}
                  className="w-12 h-12 cursor-pointer"
                />
                <input
                  type="text"
                  {...register('accentColor')}
                  className="flex-1 p-2 border rounded"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 flex items-center gap-2">
              <Image size={16} />
              Background Image URL (Optional)
            </label>
            <input
              type="text"
              {...register('backgroundImage')}
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="https://images.unsplash.com/..."
            />

            <div className="mt-3 p-4 border rounded-lg bg-gray-50">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold">Search Unsplash</span>
                <span className="text-xs text-gray-500">(uses Unsplash API)</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={unsplashQuery}
                  onChange={(e) => setUnsplashQuery(e.target.value)}
                  className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., fireworks, beach, neon city"
                />
                <button
                  type="button"
                  onClick={searchUnsplash}
                  disabled={unsplashLoading}
                  className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {unsplashLoading ? 'Searching…' : 'Search'}
                </button>
              </div>
              {unsplashError && <p className="text-sm text-red-600 mt-2">{unsplashError}</p>}
              {unsplashResults.length > 0 && (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                  {unsplashResults.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setValue('backgroundImage', r.regular)}
                      className={`relative rounded-lg overflow-hidden border transition-all hover:scale-[1.01] ${
                        currentBackgroundImage === r.regular ? 'border-blue-600 ring-2 ring-blue-200' : 'border-gray-200'
                      }`}
                      title={r.alt || 'Unsplash image'}
                    >
                      <img src={r.small} alt={r.alt || 'Unsplash'} className="w-full h-20 object-cover" />
                      {r.credit && (
                        <div className="absolute bottom-0 left-0 right-0 text-[10px] text-white bg-black/50 px-2 py-1 truncate">
                          {r.credit}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Privacy */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="isPublic"
            {...register('isPublic')}
            className="w-5 h-5"
          />
          <label htmlFor="isPublic" className="text-sm">
            Make this countdown public (anyone with the link can view it)
          </label>
        </div>
        <motion.button
          type="submit"
          disabled={isLoading}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Creating Countdown...
            </span>
          ) : (
            'Create Countdown'
          )}
        </motion.button>
      </motion.div>
    </form>
  );
};

export default CountdownForm;
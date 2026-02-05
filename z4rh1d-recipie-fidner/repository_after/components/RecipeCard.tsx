import { Recipe } from '@/lib/types';

interface RecipeCardProps {
  recipe: Recipe;
}

const difficultyColors = {
  Easy: 'bg-green-500',
  Medium: 'bg-yellow-500',
  Hard: 'bg-red-500',
};

export default function RecipeCard({ recipe }: RecipeCardProps) {
  return (
    <div
      className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
      data-testid={`recipe-card-${recipe.id}`}
    >
      <div className="relative">
        <img
          src={recipe.image}
          alt={recipe.title}
          className="w-full h-48 object-cover"
          data-testid="recipe-image"
        />
        <span
          className={`absolute top-2 right-2 px-2 py-1 rounded text-white text-xs font-semibold ${
            difficultyColors[recipe.difficulty]
          }`}
          data-testid="difficulty-badge"
        >
          {recipe.difficulty}
        </span>
      </div>
      <div className="p-4">
        <h3
          className="text-lg font-semibold text-gray-800 mb-2"
          data-testid="recipe-title"
        >
          {recipe.title}
        </h3>
        <div className="flex flex-wrap gap-1">
          {recipe.ingredients.map((ingredient) => (
            <span
              key={ingredient}
              className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded"
            >
              {ingredient}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

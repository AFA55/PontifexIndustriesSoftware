'use client';

import { useState } from 'react';

interface FeedbackModalProps {
  onSubmit: (feedback: {
    difficultyRating: number;
    accessRating: number;
    difficultyNotes: string;
    accessNotes: string;
  }) => void;
  onCancel: () => void;
  /** Called when validation fails (e.g. missing required ratings). */
  onValidationError: (message: string) => void;
}

export default function FeedbackModal({ onSubmit, onCancel, onValidationError }: FeedbackModalProps) {
  const [difficultyRating, setDifficultyRating] = useState(0);
  const [accessRating, setAccessRating] = useState(0);
  const [difficultyNotes, setDifficultyNotes] = useState('');
  const [accessNotes, setAccessNotes] = useState('');

  const handleSubmit = () => {
    if (difficultyRating === 0) {
      onValidationError('Please rate the job difficulty');
      return;
    }
    if (accessRating === 0) {
      onValidationError('Please rate the job site access');
      return;
    }
    onSubmit({ difficultyRating, accessRating, difficultyNotes, accessNotes });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-2xl w-full p-4 sm:p-8 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Job Feedback</h2>
          <p className="text-gray-600">Help us improve by rating this job</p>
        </div>

        <div className="space-y-6">
          {/* Job Difficulty Rating */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              How difficult was this job? *
            </label>
            <div className="flex gap-2 justify-between">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => setDifficultyRating(rating)}
                  className={`flex-1 px-4 py-3 rounded-xl border-2 transition-all ${
                    difficultyRating === rating
                      ? 'bg-blue-500 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="text-2xl mb-1">
                    {rating === 1 && '😊'}
                    {rating === 2 && '🙂'}
                    {rating === 3 && '😐'}
                    {rating === 4 && '😰'}
                    {rating === 5 && '😫'}
                  </div>
                  <div className="text-xs font-medium">
                    {rating === 1 && 'Very Easy'}
                    {rating === 2 && 'Easy'}
                    {rating === 3 && 'Moderate'}
                    {rating === 4 && 'Hard'}
                    {rating === 5 && 'Very Hard'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              What made it {difficultyRating >= 4 ? 'difficult' : difficultyRating >= 3 ? 'challenging' : 'easy'}? (Optional)
            </label>
            <textarea
              value={difficultyNotes}
              onChange={(e) => setDifficultyNotes(e.target.value)}
              placeholder="E.g., Steel rebar, tight spaces, complex cuts..."
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-gray-900"
              rows={2}
            />
          </div>

          {/* Job Access Rating */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              How was the job site access? *
            </label>
            <div className="flex gap-2 justify-between">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => setAccessRating(rating)}
                  className={`flex-1 px-4 py-3 rounded-xl border-2 transition-all ${
                    accessRating === rating
                      ? 'bg-green-500 text-white border-green-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-green-300'
                  }`}
                >
                  <div className="text-2xl mb-1">
                    {rating === 1 && '✅'}
                    {rating === 2 && '👍'}
                    {rating === 3 && '👌'}
                    {rating === 4 && '⚠️'}
                    {rating === 5 && '🚫'}
                  </div>
                  <div className="text-xs font-medium">
                    {rating === 1 && 'Excellent'}
                    {rating === 2 && 'Good'}
                    {rating === 3 && 'Fair'}
                    {rating === 4 && 'Poor'}
                    {rating === 5 && 'Very Poor'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Access Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Access details (Optional)
            </label>
            <textarea
              value={accessNotes}
              onChange={(e) => setAccessNotes(e.target.value)}
              placeholder="E.g., Narrow stairs, elevator out of service, parking far away..."
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none text-gray-900"
              rows={2}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button
            onClick={onCancel}
            className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={difficultyRating === 0 || accessRating === 0}
            className={`flex-1 px-6 py-4 rounded-xl font-bold transition-all shadow-lg hover:shadow-xl ${
              difficultyRating === 0 || accessRating === 0
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white'
            }`}
          >
            Submit Work Performed
          </button>
        </div>
      </div>
    </div>
  );
}

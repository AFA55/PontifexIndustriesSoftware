'use client';

import { motion } from 'framer-motion';
import { Mic, MicOff } from 'lucide-react';

interface VoiceMicButtonProps {
  isListening: boolean;
  onClick: () => void;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  /** Visual mode: 'normal' for step-by-step, 'free-speech' for extended listening */
  mode?: 'normal' | 'free-speech';
}

export function VoiceMicButton({
  isListening,
  onClick,
  size = 'lg',
  disabled = false,
  className = '',
  mode = 'normal',
}: VoiceMicButtonProps) {
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-14 h-14',
    lg: 'w-20 h-20',
  };

  const iconSizes = {
    sm: 18,
    md: 24,
    lg: 32,
  };

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      {/* Pulsing ring when listening */}
      {isListening && mode === 'normal' && (
        <>
          <motion.div
            className={`absolute ${sizeClasses[size]} rounded-full bg-red-500/20`}
            animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className={`absolute ${sizeClasses[size]} rounded-full bg-red-500/15`}
            animate={{ scale: [1, 2.2, 1], opacity: [0.4, 0, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
          />
          <motion.div
            className={`absolute ${sizeClasses[size]} rounded-full bg-red-500/10`}
            animate={{ scale: [1, 2.6, 1], opacity: [0.3, 0, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
          />
        </>
      )}

      {/* Wider, slower pulsing ring for free-speech mode */}
      {isListening && mode === 'free-speech' && (
        <>
          <motion.div
            className={`absolute ${sizeClasses[size]} rounded-full bg-orange-500/25`}
            animate={{ scale: [1, 2.0, 1], opacity: [0.7, 0, 0.7] }}
            transition={{ duration: 2.0, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className={`absolute ${sizeClasses[size]} rounded-full bg-orange-500/15`}
            animate={{ scale: [1, 2.5, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2.0, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
          />
          <motion.div
            className={`absolute ${sizeClasses[size]} rounded-full bg-orange-500/10`}
            animate={{ scale: [1, 3.0, 1], opacity: [0.3, 0, 0.3] }}
            transition={{ duration: 2.0, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
          />
        </>
      )}

      {/* Main button */}
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled}
        whileTap={{ scale: 0.9 }}
        whileHover={{ scale: 1.05 }}
        className={`
          relative z-10 ${sizeClasses[size]} rounded-full
          flex items-center justify-center
          transition-all duration-300 shadow-lg
          ${disabled
            ? 'bg-gray-400 cursor-not-allowed'
            : isListening
              ? 'bg-red-500 hover:bg-red-600 shadow-red-500/40'
              : 'bg-gradient-to-br from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 shadow-orange-500/30'
          }
        `}
      >
        {isListening ? (
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          >
            <Mic size={iconSizes[size]} className="text-white" />
          </motion.div>
        ) : (
          disabled ? (
            <MicOff size={iconSizes[size]} className="text-white/70" />
          ) : (
            <Mic size={iconSizes[size]} className="text-white" />
          )
        )}
      </motion.button>

      {/* Status label */}
      {size === 'lg' && (
        <motion.p
          className="absolute -bottom-8 text-xs font-bold whitespace-nowrap"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          key={`${isListening}-${mode}`}
        >
          {isListening ? (
            mode === 'free-speech' ? (
              <span className="text-orange-400">Keep talking...</span>
            ) : (
              <span className="text-red-400">Listening...</span>
            )
          ) : (
            <span className="text-gray-400">Tap to speak</span>
          )}
        </motion.p>
      )}
    </div>
  );
}

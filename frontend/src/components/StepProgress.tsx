"use client";

interface Step {
  label: string;
  description: string;
}

interface StepProgressProps {
  steps: Step[];
  currentStep: number;
  completedSteps: Set<number>;
}

export function StepProgress({ steps, currentStep, completedSteps }: StepProgressProps) {
  return (
    <div className="flex items-center justify-between mb-8">
      {steps.map((step, index) => {
        const isCompleted = completedSteps.has(index);
        const isCurrent = index === currentStep;
        const isPast = index < currentStep;

        return (
          <div key={index} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-500 ${
                  isCompleted
                    ? "bg-green-600 text-white scale-110"
                    : isCurrent
                    ? "bg-purple-600 text-white animate-pulse"
                    : isPast
                    ? "bg-purple-800 text-purple-300"
                    : "bg-gray-800 text-gray-500"
                }`}
              >
                {isCompleted ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={`mt-2 text-xs font-medium text-center max-w-[80px] ${
                  isCurrent ? "text-purple-300" : isCompleted ? "text-green-400" : "text-gray-500"
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 mt-[-20px] transition-colors duration-500 ${
                  isCompleted || isPast ? "bg-purple-600" : "bg-gray-800"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
